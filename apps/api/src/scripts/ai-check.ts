/**
 * Checks that the OpenAI key and model work with one tiny request:
 *   docker compose exec api npm run ai:check
 * The request goes through the normal AI service, so it's logged and counts
 * towards the monthly limit like any other. Never part of `npm test`.
 */
import path from 'node:path';
import { z } from 'zod';
import { createOpenAiProvider } from '../ai/openai-provider';
import { createAiService } from '../ai/service';
import { loadConfig } from '../config';
import { openDatabase } from '../db/client';
import { createAiRequestRepository } from '../repositories/ai-requests';
import { createSettingsRepository } from '../repositories/settings';
import { createSettingsService } from '../services/settings';

const config = loadConfig();
if (!config.openai.apiKey) {
  console.error('✘ OPENAI_API_KEY is not set. Add it to the .env file next to compose.yaml, then recreate the api container.');
  process.exit(1);
}

const db = openDatabase(path.join(config.storageDir, 'plants.sqlite'));
const settings = createSettingsService(createSettingsRepository(db));
const ai = createAiService({
  provider: createOpenAiProvider({ apiKey: config.openai.apiKey, model: config.openai.model, embeddingModel: config.openai.embeddingModel, timeoutMs: config.openai.timeoutMs }),
  settings,
  requests: createAiRequestRepository(db),
});

const started = Date.now();
try {
  const { data: answer } = await ai.generate(
    { kind: 'check' },
    {
      instructions: 'You are a connectivity check for a houseplant app. Answer briefly.',
      input: [{ type: 'text', text: 'Confirm you can read this, and name one easy-care houseplant.' }],
      schema: z.strictObject({ ok: z.boolean(), houseplant: z.string() }),
      schemaName: 'connection_check',
      maxOutputTokens: 1000,
    },
  );
  const status = ai.status();
  console.log(`✔ ${config.openai.model} answered in ${Date.now() - started} ms: ${JSON.stringify(answer)}`);
  console.log(`  AI requests this month: ${status.usedThisMonth} of ${status.monthlyLimit}`);
} catch (err) {
  console.error(`✘ AI check failed: ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
} finally {
  db.$client.close();
}
