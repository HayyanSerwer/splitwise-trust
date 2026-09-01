// Applies db/schema.sql. Every statement is `create table if not exists`, so
// running this repeatedly is safe — it is the setup step, not a migration
// history. Reads .env.local so it works the same locally and on Vercel.
import { readFile } from 'node:fs/promises';
import { neon } from '@neondatabase/serverless';

const root = new URL('..', import.meta.url);

try {
  const env = await readFile(new URL('.env.local', root), 'utf8');
  for (const line of env.split('\n')) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (match && !process.env[match[1]]) {
      process.env[match[1]] = match[2].trim().replace(/^["']|["']$/g, '');
    }
  }
} catch {
  // No .env.local — fall back to whatever is already in the environment.
}

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set. Put it in .env.local first.');
  process.exit(1);
}

const sql = neon(process.env.DATABASE_URL);
const schema = await readFile(new URL('db/schema.sql', root), 'utf8');

// Split on semicolons at end of line; the schema has no functions or strings
// containing one, so this is sufficient and avoids pulling in a SQL parser.
// Leading comment lines are stripped rather than used to skip a chunk — a
// commented statement is still a statement, and dropping it leaves the schema
// half-built.
const statements = schema
  .split(/;\s*$/m)
  .map((s) => s.replace(/^(\s*--[^\n]*\n)+/, '').trim())
  .filter(Boolean);

// The HTTP driver is tagged-template only — it has no .query() — so hand it
// the shape a tagged template would: a strings array carrying .raw, and no
// interpolated values. Safe here because these statements come from a file in
// the repo, never from user input.
const asTemplate = (text) => Object.assign([text], { raw: [text] });

for (const statement of statements) {
  await sql(asTemplate(statement));
  console.log('✓', statement.split('\n')[0].slice(0, 70));
}

console.log(`\nSchema applied (${statements.length} statements).`);
