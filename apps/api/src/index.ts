import path from 'node:path';
import { serve } from '@hono/node-server';
import { createOpenAiProvider } from './ai/openai-provider';
import { createApp } from './app';
import { CatalogValidationError, loadCatalog, type SpeciesCatalog } from './catalog/loader';
import { loadConfig } from './config';
import { openDatabase } from './db/client';
import { createWebPushSender } from './push/sender';

const config = loadConfig();

let catalog: SpeciesCatalog;
try {
  catalog = await loadCatalog(config.catalogDir);
} catch (err) {
  if (err instanceof CatalogValidationError) {
    // Fail loudly: a broken catalog file should be fixed, not silently skipped.
    console.error(`[api] ${err.message}`);
    console.error('[api] Fix the files above (`npm run validate:catalog`), then restart the api service.');
    process.exit(1);
  }
  throw err;
}
console.log(`[api] loaded ${catalog.size} species from ${config.catalogDir}`);

const dbFile = path.join(config.storageDir, 'plants.sqlite');
const db = openDatabase(dbFile);
console.log(`[api] database ready: ${dbFile}`);

const aiProvider = config.openai.apiKey
  ? createOpenAiProvider({ apiKey: config.openai.apiKey, model: config.openai.model, timeoutMs: config.openai.timeoutMs })
  : null;
console.log(aiProvider ? `[api] AI features: OpenAI ${aiProvider.model}` : '[api] AI features: off (OPENAI_API_KEY not set)');

const app = createApp({
  catalog,
  db,
  photosDir: path.join(config.storageDir, 'photos'),
  maxUploadBytes: config.maxUploadBytes,
  aiProvider,
  pushSender: config.vapid ? createWebPushSender(config.vapid) : null,
  appUrl: config.appUrl,
});
console.log(config.vapid ? '[api] push notifications: on' : '[api] push notifications: off (VAPID keys not set)');
const stopDigest = app.push.start();

const server = serve({ fetch: app.fetch, port: config.port, hostname: '0.0.0.0' }, (info) => {
  console.log(`[api] listening on http://0.0.0.0:${info.port}`);
});

function shutdown(signal: string) {
  console.log(`[api] ${signal} received, shutting down`);
  stopDigest();
  server.close(() => {
    db.$client.close();
    process.exit(0);
  });
  // Don't hang forever on keep-alive connections.
  setTimeout(() => {
    db.$client.close();
    process.exit(0);
  }, 3000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
