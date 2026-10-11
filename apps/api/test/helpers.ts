import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach } from 'vitest';
import { createApp } from '../src/app';
import { createCatalog } from '../src/catalog/loader';
import { openDatabase } from '../src/db/client';
import { makeSpecies } from './fixtures/species';

const tempDirs: string[] = [];

/** Creates a temporary directory removed after each test. */
export function tempDir(prefix = 'houseplant-test-'): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

export function writeJson(dir: string, file: string, value: unknown) {
  fs.writeFileSync(path.join(dir, file), typeof value === 'string' ? value : JSON.stringify(value, null, 2));
}

/**
 * App wired to an in-memory database, a temp photos dir and a one-species
 * catalog. Create it inside each test (or `beforeEach`), since the temp
 * directory is removed after every test.
 */
export function createTestApp(options: { maxUploadBytes?: number } = {}) {
  const db = openDatabase(':memory:');
  const photosDir = tempDir('houseplant-photos-');
  const app = createApp({
    catalog: createCatalog([makeSpecies('test-plant', 'Test Plant')]),
    db,
    photosDir,
    maxUploadBytes: options.maxUploadBytes ?? 5 * 1024 * 1024,
    quiet: true,
  });

  /** Sends a JSON request and parses the JSON response (null for empty bodies). */
  const json = async (method: string, url: string, body?: unknown) => {
    const res = await app.request(url, {
      method,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    return { status: res.status, body: (text ? JSON.parse(text) : null) as any };
  };

  return { app, db, photosDir, json };
}
