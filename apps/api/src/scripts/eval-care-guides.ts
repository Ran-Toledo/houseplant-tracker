/**
 * Checks that care-guide search finds the right sections for symptom questions
 * with known answers (care-guide-questions.json), using real embeddings:
 *   docker compose exec api npm run eval:guides
 * Searches rank in English, so for a non-English question the chat model first
 * writes the English query, as the assistant does; the untranslated question's
 * rank is shown too. Every call goes through the normal AI service, so it's
 * logged and counts towards the monthly limit (one request per English
 * question, three per other question, plus building the index if it isn't up
 * to date). Never part of `npm test`.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { Language } from '@houseplant/shared';
import { z } from 'zod';
import { createOpenAiProvider } from '../ai/openai-provider';
import { createAiService } from '../ai/service';
import { createCareGuideIndex } from '../assistant/care-guides';
import { CatalogValidationError, loadCatalog } from '../catalog/loader';
import { loadConfig } from '../config';
import { openDatabase } from '../db/client';
import { createAiRequestRepository } from '../repositories/ai-requests';
import { createCareGuideSectionRepository } from '../repositories/care-guide-sections';
import { createSettingsRepository } from '../repositories/settings';
import { createSettingsService } from '../services/settings';

interface Question {
  lang: Language;
  query: string;
  speciesId: string | null;
  /** Sections that answer the question, `speciesId:sectionKey`; `*` matches any species. */
  accept: string[];
}

const config = loadConfig();
if (!config.openai.apiKey) {
  console.error('✘ OPENAI_API_KEY is not set. Add it to the .env file next to compose.yaml, then recreate the api container.');
  process.exit(1);
}

let catalog;
try {
  catalog = await loadCatalog(config.catalogDir);
} catch (err) {
  console.error(err instanceof CatalogValidationError ? `✘ ${err.message}` : err);
  process.exit(1);
}

const questions = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, 'care-guide-questions.json'), 'utf8')) as Question[];
const db = openDatabase(path.join(config.storageDir, 'plants.sqlite'));
const ai = createAiService({
  provider: createOpenAiProvider({
    apiKey: config.openai.apiKey,
    model: config.openai.model,
    embeddingModel: config.openai.embeddingModel,
    timeoutMs: config.openai.timeoutMs,
  }),
  settings: createSettingsService(createSettingsRepository(db)),
  requests: createAiRequestRepository(db),
});
const index = createCareGuideIndex({ catalog, sections: createCareGuideSectionRepository(db), ai });

/** The English search query the assistant would write for a question in another language. */
async function englishQuery(question: string): Promise<string> {
  const { data } = await ai.generate(
    { kind: 'check' },
    {
      instructions:
        "You write search queries for a houseplant care-guide search tool. Describe only the owner's symptom, problem or care question in plain English words, translating it if needed; leave out generic words like 'houseplant' or 'care'. Answer with the query only.",
      input: [{ type: 'text', text: question }],
      schema: z.strictObject({ query: z.string() }),
      schemaName: 'search_query',
      maxOutputTokens: 1000,
    },
  );
  return data.query;
}

const accepted = (q: Question, speciesId: string, sectionKey: string) =>
  q.accept.some((a) => {
    const [species, key] = a.split(':');
    return (species === '*' || species === speciesId) && key === sectionKey;
  });

try {
  const sync = await index.sync();
  console.log(`Index: ${sync.total} sections, ${sync.embedded} embedded now (${config.openai.embeddingModel})\n`);

  let top1 = 0;
  let top5 = 0;
  const rankOf = async (q: Question, query: string) => {
    const matches = await index.search(query, { lang: q.lang, speciesId: q.speciesId, limit: 5 });
    return { matches, rank: matches.findIndex((m) => accepted(q, m.speciesId, m.sectionKey)) + 1 };
  };
  const rankText = (rank: number) => (rank === 0 ? 'not in top 5' : `rank ${rank}`);

  for (const q of questions) {
    const query = q.lang === 'en' ? q.query : await englishQuery(q.query);
    const { matches, rank } = await rankOf(q, query);
    if (rank === 1) top1++;
    if (rank >= 1) top5++;
    console.log(`${rank >= 1 ? '✔' : '✘'} [${q.lang}] ${q.query}${q.speciesId ? ` (${q.speciesId})` : ''}${rank > 1 ? ` — rank ${rank}` : ''}`);
    if (query !== q.query) {
      console.log(`    query: ${query}`);
      console.log(`    (the untranslated question: ${rankText((await rankOf(q, q.query)).rank)})`);
    }
    for (const m of matches) console.log(`    ${m.score.toFixed(3)}  ${m.speciesId}:${m.sectionKey}${accepted(q, m.speciesId, m.sectionKey) ? '  ✓' : ''}`);
  }
  console.log(`\nhit@1 ${top1}/${questions.length} · hit@5 ${top5}/${questions.length}`);
  db.$client.close();
  process.exit(top5 === questions.length ? 0 : 1);
} catch (err) {
  console.error(`✘ ${err instanceof Error ? err.message : err}`);
  db.$client.close();
  process.exit(1);
}
