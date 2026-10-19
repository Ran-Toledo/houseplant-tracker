import { z } from 'zod';
import type { Photo } from './plants';
import { LANGUAGES } from './species';

/**
 * The read-only assistant: conversations, messages and the events streamed
 * while an answer is written. The assistant reads the plant database and the
 * catalog through tools; it never changes anything.
 */

/** Tools the assistant can call; the UI names them in its "looking at…" status line. */
export const ASSISTANT_TOOL_NAMES = [
  'list_plants',
  'get_plant',
  'get_care_history',
  'get_health_checks',
  'get_care_signals',
  'search_species',
  'get_species_guide',
] as const;
export type AssistantToolName = (typeof ASSISTANT_TOOL_NAMES)[number];

export const conversationCreateSchema = z.strictObject({
  /** The plant the conversation is about; omitted or null for a general one. */
  plantId: z.uuid().nullable().optional(),
});
export type ConversationCreateInput = z.input<typeof conversationCreateSchema>;

export const conversationListQuerySchema = z.strictObject({ plantId: z.uuid().optional() });

export const chatMessageInputSchema = z.strictObject({
  text: z.string().trim().min(1, 'is required').max(4000, 'must be at most 4000 characters'),
  /** A photo of the conversation's plant to send with this message. */
  photoId: z.uuid().nullable().optional(),
  /** The UI language; the answer is written in it. */
  lang: z.enum(LANGUAGES),
});
export type ChatMessageInput = z.input<typeof chatMessageInputSchema>;

export interface Conversation {
  id: string;
  plantId: string | null;
  /** The plant, for plant conversations. */
  plant: { id: string; nickname: string; coverPhoto: Photo | null } | null;
  /** The first question, shortened; null until the first message. */
  title: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant';
  /** Plain text for user messages, Markdown for the assistant's. */
  content: string;
  photo: Photo | null;
  createdAt: string;
}

/** Server-Sent Events of `POST /api/conversations/:id/messages`, in this order. */
export type ChatEvent =
  /** The stored user message. */
  | { type: 'message'; message: ChatMessage }
  /** The assistant is reading data with a tool. */
  | { type: 'status'; tool: AssistantToolName }
  /** A piece of the answer. */
  | { type: 'delta'; text: string }
  /** The stored answer. */
  | { type: 'done'; message: ChatMessage }
  | { type: 'error'; error: { code: string; message: string } };
