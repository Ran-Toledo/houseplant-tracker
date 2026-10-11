import { defineConfig } from 'drizzle-kit';

// Used only to generate SQL migrations: `npm run db:generate -w apps/api`.
export default defineConfig({
  dialect: 'sqlite',
  schema: './src/db/schema.ts',
  out: './drizzle',
});
