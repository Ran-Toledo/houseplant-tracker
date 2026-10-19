// Bundles the API and its maintenance scripts into dist/ for the release image,
// so it runs on plain Node with production dependencies only (no tsx).
import fs from 'node:fs/promises';
import { build } from 'esbuild';

const scripts = { backup: 'backup', restore: 'restore', 'validate:catalog': 'validate-catalog', 'ai:check': 'ai-check' };

await fs.rm('dist', { recursive: true, force: true });
await build({
  entryPoints: ['src/index.ts', ...Object.values(scripts).map((s) => `src/scripts/${s}.ts`)],
  outbase: 'src',
  outdir: 'dist',
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  // Native modules are loaded from node_modules at runtime.
  external: ['better-sqlite3', 'sharp'],
  // Lets bundled CommonJS code call require() inside an ES module.
  banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
  logLevel: 'info',
});

// Same npm script names as in development, so the documented commands work in both.
await fs.writeFile(
  'dist/package.json',
  JSON.stringify(
    {
      name: '@houseplant/api-release',
      private: true,
      type: 'module',
      scripts: {
        start: 'node index.js',
        ...Object.fromEntries(Object.entries(scripts).map(([name, file]) => [name, `node scripts/${file}.js`])),
      },
    },
    null,
    2,
  ),
);
