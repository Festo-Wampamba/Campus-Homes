import { defineConfig } from 'drizzle-kit';

// Migrations need the owner role; DATABASE_URL is the RLS-bound app role where
// the two are split (production, and local after `pnpm local:logto`).
const url = process.env.DATABASE_MIGRATIONS_URL ?? process.env.DATABASE_URL;
if (!url) {
  throw new Error('DATABASE_URL is required (never hardcode it)');
}

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema/index.ts',
  out: './migrations',
  dbCredentials: {
    url,
  },
});
