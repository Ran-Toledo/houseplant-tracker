import path from 'node:path';

function intFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`Environment variable ${name} must be a positive integer (got "${raw}")`);
  }
  return value;
}

export interface AppConfig {
  port: number;
  /** Directory holding the SQLite database and the photos/ directory. */
  storageDir: string;
  /** Read-only directory of species JSON files. */
  catalogDir: string;
  /** Maximum accepted upload size, in bytes. */
  maxUploadBytes: number;
  /** OpenAI settings; `apiKey` is null when AI features aren't set up. */
  openai: { apiKey: string | null; model: string; timeoutMs: number };
}

/** Default model for AI features; override with OPENAI_MODEL. */
const DEFAULT_OPENAI_MODEL = 'gpt-5.4-mini';

/** Repository root, used for sensible defaults when running outside Docker. */
const repoRoot = path.resolve(import.meta.dirname, '../../..');

export function loadConfig(): AppConfig {
  return {
    port: intFromEnv('PORT', 3000),
    storageDir: path.resolve(process.env.STORAGE_DIR || path.join(repoRoot, 'storage')),
    catalogDir: path.resolve(process.env.CATALOG_DIR || path.join(repoRoot, 'species-catalog')),
    maxUploadBytes: intFromEnv('MAX_UPLOAD_MB', 15) * 1024 * 1024,
    openai: {
      apiKey: process.env.OPENAI_API_KEY?.trim() || null,
      model: process.env.OPENAI_MODEL?.trim() || DEFAULT_OPENAI_MODEL,
      timeoutMs: intFromEnv('AI_TIMEOUT_MS', 60_000),
    },
  };
}
