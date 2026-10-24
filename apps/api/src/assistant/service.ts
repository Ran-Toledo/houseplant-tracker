import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  ASSISTANT_TOOL_NAMES,
  type AssistantToolName,
  type ChatEvent,
  type ChatMessage,
  type Conversation,
  type Language,
} from '@houseplant/shared';
import { toModelImage } from '../ai/images';
import type { ChatInputItem } from '../ai/provider';
import type { AiService } from '../ai/service';
import type { MessageRow } from '../db/schema';
import { ApiError, notFound } from '../middleware/errors';
import type { ConversationRepository } from '../repositories/conversations';
import type { PhotoService } from '../services/photos';
import type { CareGuideIndex } from './care-guides';
import type { ReadModel } from './read-model';
import { ASSISTANT_TOOLS, runTool } from './tools';

interface Deps {
  ai: AiService;
  conversations: ConversationRepository;
  data: ReadModel;
  guides: Pick<CareGuideIndex, 'search'>;
  photos: Pick<PhotoService, 'load'>;
  now?: () => Date;
}

/** Messages sent verbatim with every request; older ones are covered by the summary. */
export const HISTORY_WINDOW = 20;
/** Re-summarize once this many messages have dropped out of the window since the last summary. */
const SUMMARY_BATCH = 10;
/** Model calls per answer: tool rounds plus the final answer. */
const MAX_STEPS = 6;
const TITLE_LENGTH = 60;

const LANGUAGE_NAMES: Record<Language, string> = { en: 'English', he: 'Hebrew' };

function instructions(opts: {
  lang: Language;
  today: string;
  plant: Conversation['plant'];
  /** The plant's catalog species id, when it has one. */
  speciesId: string | null;
  summary: string | null;
}): string {
  return [
    "You are the assistant in a personal houseplant-tracking app. You help the owner look after their own plants.",
    `Today is ${opts.today}. Answer in ${LANGUAGE_NAMES[opts.lang]}; keep plant nicknames exactly as the owner wrote them.`,
    opts.plant
      ? `This conversation is about the plant "${opts.plant.nickname}" (id ${opts.plant.id}${
          opts.speciesId ? `, catalog species id ${opts.speciesId}` : ', not in the catalog'
        }). Look it up with your tools before giving advice about it.`
      : 'This is a general conversation about the whole collection; use list_plants to see the plants.',
    '',
    'Rules:',
    "- Base answers on the owner's data and the catalog guides from your tools, not guesses. Use get_care_signals for advice about a plant's care.",
    "- For a symptom or problem (what the leaves look like, what went wrong), call search_care_guides with the symptom in plain English words (translate it if needed), passing the plant's speciesId when it has one.",
    '- When advice comes from the species guide, say so (for example, "the Monstera guide says…").',
    "- Say when you're unsure or the data doesn't say, and suggest what the owner could check.",
    '- Mention toxicity for pets and children when it matters. Toxicity comes only from catalog guides: for a plant without one, say it is unknown and suggest checking a reliable source, never call it safe.',
    "- You can only read data. You can't log care, change plants or set reminders; tell the owner where they can do it themselves (for example, \"you can log this from the plant's page\").",
    '- Keep answers short and practical. Use Markdown lists and bold sparingly; no headings, tables or links.',
    '- Only help with plants and plant care.',
    ...(opts.lang === 'he'
      ? [
          "- The owner's gender is unknown: use gender-neutral Hebrew (infinitives such as \"כדאי לבדוק\", or plural forms), never masculine or feminine forms addressed to the owner.",
        ]
      : []),
    ...(opts.summary ? ['', `Summary of the earlier conversation:\n${opts.summary}`] : []),
  ].join('\n');
}

/** A message that passed the checks: its conversation, and the attached photo ready for the model. */
export interface PreparedMessage {
  conversation: Conversation;
  image: string | null;
}

const summarySchema = z.strictObject({ summary: z.string() });

/** The read-only assistant: conversations stored in SQLite, answers streamed from the model. */
export function createAssistantService({ ai, conversations, data, guides, photos, now = () => new Date() }: Deps) {
  function getRow(id: string) {
    const row = conversations.get(id);
    if (!row) throw notFound('Conversation');
    return row;
  }

  function get(id: string): Conversation {
    return conversations.toConversationDto(getRow(id));
  }

  /** The answer's timestamp, always after the question's so the order is stable. */
  const after = (iso: string) => new Date(Math.max(now().getTime(), Date.parse(iso) + 1)).toISOString();

  async function historyItems(rows: MessageRow[], current: { row: MessageRow; image: string | null }): Promise<ChatInputItem[]> {
    return rows.map((m): ChatInputItem => {
      if (m.role === 'assistant') return { type: 'message', role: 'assistant', text: m.content };
      // Only the new message's photo is sent; earlier photos would cost tokens on every request.
      const isCurrent = m.id === current.row.id;
      const note = m.photoId && !isCurrent ? '\n[A photo was attached to this message.]' : '';
      return {
        type: 'message',
        role: 'user',
        content: [
          { type: 'text', text: m.content + note },
          ...(isCurrent && current.image ? [{ type: 'image' as const, dataUrl: current.image }] : []),
        ],
      };
    });
  }

  /** Folds messages that left the history window into the conversation's summary. Failures only log. */
  async function updateSummary(conversationId: string, lang: Language): Promise<void> {
    const row = getRow(conversationId);
    const all = conversations.messages(conversationId);
    const outside = all.length - HISTORY_WINDOW;
    if (outside - row.summarizedCount < SUMMARY_BATCH) return;
    const fresh = all.slice(row.summarizedCount, outside);
    try {
      const { data: result } = await ai.generate(
        { kind: 'chat', plantId: row.plantId },
        {
          instructions: `Summarize this part of a conversation between a houseplant owner and an assistant in a few sentences of ${LANGUAGE_NAMES[lang]}. Keep facts, advice given and open questions; drop small talk.`,
          input: [
            {
              type: 'text',
              text: [
                row.summary ? `Earlier summary:\n${row.summary}\n` : '',
                'Messages:',
                ...fresh.map((m) => `${m.role === 'user' ? 'Owner' : 'Assistant'}: ${m.content}`),
              ].join('\n'),
            },
          ],
          schema: summarySchema,
          schemaName: 'conversation_summary',
          maxOutputTokens: 1500,
        },
      );
      conversations.update(conversationId, { summary: result.summary, summarizedCount: outside });
    } catch (err) {
      console.error('[api] could not update the conversation summary', err);
    }
  }

  return {
    list(plantId?: string): Conversation[] {
      return conversations.list(plantId).map(conversations.toConversationDto);
    },

    get,

    create(plantId: string | null): Conversation {
      if (plantId && !data.plant(plantId)) throw notFound('Plant');
      const timestamp = now().toISOString();
      const id = randomUUID();
      conversations.insert({ id, plantId, title: null, summary: null, summarizedCount: 0, createdAt: timestamp, updatedAt: timestamp });
      return get(id);
    },

    messages(id: string): ChatMessage[] {
      getRow(id);
      return conversations.messages(id).map(conversations.toMessageDto);
    },

    delete(id: string): void {
      if (!conversations.delete(id)) throw notFound('Conversation');
    },

    /** Checks a message can be sent before the stream starts, so failures are plain HTTP errors. */
    async prepare(id: string, input: { photoId?: string | null }): Promise<PreparedMessage> {
      const conversation = get(id);
      ai.ensureAvailable();
      let image: string | null = null;
      if (input.photoId) {
        const { photo, data: file } = await photos.load(input.photoId);
        if (!conversation.plantId || photo.plantId !== conversation.plantId) {
          throw new ApiError(400, 'validation_error', "Only photos of the conversation's plant can be attached", [
            { path: 'photoId', message: "is not a photo of this conversation's plant" },
          ]);
        }
        image = await toModelImage(file);
      }
      return { conversation, image };
    },

    /**
     * Stores the question, streams the answer as events and stores it. Runs
     * read-only tools when the model asks for them. Errors are emitted as an
     * `error` event; the question stays stored either way.
     */
    async reply(
      prepared: PreparedMessage,
      input: { text: string; photoId?: string | null; lang: Language },
      emit: (event: ChatEvent) => Promise<void> | void,
    ): Promise<void> {
      const { conversation, image } = prepared;
      const question: MessageRow = {
        id: randomUUID(),
        conversationId: conversation.id,
        role: 'user',
        content: input.text,
        photoId: input.photoId ?? null,
        toolTraceJson: null,
        aiRequestId: null,
        createdAt: now().toISOString(),
      };
      conversations.insertMessage(question);
      conversations.update(conversation.id, {
        updatedAt: question.createdAt,
        ...(conversation.title ? {} : { title: input.text.replace(/\s+/g, ' ').slice(0, TITLE_LENGTH) }),
      });
      await emit({ type: 'message', message: conversations.toMessageDto(question) });

      const row = getRow(conversation.id);
      const recent = conversations.messages(conversation.id).slice(-HISTORY_WINDOW);
      const input0 = await historyItems(recent, { row: question, image });
      const speciesId = conversation.plantId ? (data.plant(conversation.plantId)?.speciesId ?? null) : null;
      const system = instructions({ lang: input.lang, today: data.today(), plant: conversation.plant, speciesId, summary: row.summary });
      const ctx = { data, guides, lang: input.lang };
      const trace: { tool: string; arguments: string }[] = [];

      let answer = '';
      let lastRequestId: string | null = null;
      try {
        const items = [...input0];
        for (let step = 1; step <= MAX_STEPS; step++) {
          const pending: Promise<void>[] = [];
          const result = await ai.chatStep(
            { kind: 'chat', plantId: conversation.plantId, photoId: step === 1 ? (input.photoId ?? null) : null },
            // The last step gets no tools, so it has to answer.
            { instructions: system, input: items, tools: step < MAX_STEPS ? ASSISTANT_TOOLS : [], maxOutputTokens: 4000 },
            (delta) => {
              answer += delta;
              pending.push(Promise.resolve(emit({ type: 'delta', text: delta })));
            },
          );
          await Promise.all(pending);
          lastRequestId = result.requestId;
          if (result.toolCalls.length === 0) break;

          items.push(...result.items);
          for (const call of result.toolCalls) {
            trace.push({ tool: call.name, arguments: call.arguments });
            if ((ASSISTANT_TOOL_NAMES as readonly string[]).includes(call.name)) {
              await emit({ type: 'status', tool: call.name as AssistantToolName });
            }
            items.push({ type: 'tool-result', callId: call.callId, output: JSON.stringify(await runTool(call.name, call.arguments, ctx)) });
          }
        }
      } catch (err) {
        const error = err instanceof ApiError ? { code: err.code, message: err.message } : { code: 'internal_error', message: 'An unexpected error occurred' };
        if (!(err instanceof ApiError)) console.error('[api] assistant reply failed', err);
        await emit({ type: 'error', error });
        return;
      }

      const reply: MessageRow = {
        id: randomUUID(),
        conversationId: conversation.id,
        role: 'assistant',
        content: answer.trim() || '…',
        photoId: null,
        toolTraceJson: trace.length ? JSON.stringify(trace) : null,
        aiRequestId: lastRequestId,
        createdAt: after(question.createdAt),
      };
      conversations.insertMessage(reply);
      conversations.update(conversation.id, { updatedAt: reply.createdAt });
      await emit({ type: 'done', message: conversations.toMessageDto(reply) });
      await updateSummary(conversation.id, input.lang);
    },
  };
}

export type AssistantService = ReturnType<typeof createAssistantService>;
