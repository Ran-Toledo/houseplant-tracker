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
}

/** Repository root, used for sensible defaults when running outside Docker. */
const repoRoot = path.resolve(import.meta.dirname, '../../..');

export function loadConfig(): AppConfig {
  return {
    port: intFromEnv('PORT', 3000),
    storageDir: path.resolve(process.env.STORAGE_DIR || path.join(repoRoot, 'storage')),
    catalogDir: path.resolve(process.env.CATALOG_DIR || path.join(repoRoot, 'species-catalog')),
    maxUploadBytes: intFromEnv('MAX_UPLOAD_MB', 15) * 1024 * 1024,
  };
}
