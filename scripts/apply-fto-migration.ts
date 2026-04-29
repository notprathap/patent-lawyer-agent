import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { config as loadDotenv } from 'dotenv';
import { neon } from '@neondatabase/serverless';

const __dirname = dirname(fileURLToPath(import.meta.url));

loadDotenv({ path: resolve(__dirname, '..', '.env') });

const MIGRATION_NAME = '20260429000000_add_fto_workflow';
const MIGRATION_PATH = resolve(
  __dirname,
  '..',
  'prisma',
  'migrations',
  MIGRATION_NAME,
  'migration.sql',
);

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL not set');
    process.exit(1);
  }

  const sql = neon(url);
  const migrationSql = readFileSync(MIGRATION_PATH, 'utf-8');

  console.log(`Applying migration: ${MIGRATION_NAME}`);

  // Split on semicolons at the end of lines, ignoring those inside DO $$ ... $$ blocks.
  // Simplest robust approach: send the whole script as one statement via raw query batch.
  // Neon's HTTP driver runs each call in its own session, so we use a transaction.

  // Check if already applied
  const existing = await sql`
    SELECT migration_name FROM _prisma_migrations
    WHERE migration_name = ${MIGRATION_NAME} AND finished_at IS NOT NULL
  `;
  if (existing.length > 0) {
    console.log(`Migration ${MIGRATION_NAME} already applied. Skipping.`);
    return;
  }

  // Execute statements one at a time (split on `;` at end of line; preserve DO $$ blocks)
  const statements = splitSqlStatements(migrationSql);

  console.log(`Running ${statements.length} statement(s)...`);
  for (const stmt of statements) {
    const trimmed = stmt.trim();
    if (!trimmed) continue;
    process.stdout.write(`  ▸ ${trimmed.split('\n')[0].slice(0, 80)} ... `);
    try {
      await sql.query(trimmed);
      console.log('OK');
    } catch (err) {
      console.log('FAILED');
      console.error(err);
      process.exit(1);
    }
  }

  // Record the migration in _prisma_migrations
  const checksum = computeChecksum(migrationSql);
  await sql`
    INSERT INTO _prisma_migrations (
      id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count
    )
    VALUES (
      gen_random_uuid()::text, ${checksum}, NOW(), ${MIGRATION_NAME}, NULL, NULL, NOW(), ${statements.length}
    )
    ON CONFLICT (id) DO NOTHING
  `;

  console.log(`\nMigration ${MIGRATION_NAME} applied successfully.`);
}

function splitSqlStatements(sql: string): string[] {
  const statements: string[] = [];
  let buf = '';
  let inDollar = false;
  for (const line of sql.split('\n')) {
    const stripped = line.replace(/--.*$/, '').trim();
    buf += line + '\n';
    if (line.includes('$$')) {
      const dollarCount = (line.match(/\$\$/g) || []).length;
      if (dollarCount % 2 === 1) inDollar = !inDollar;
    }
    if (!inDollar && stripped.endsWith(';')) {
      statements.push(buf.trim().replace(/;$/, ''));
      buf = '';
    }
  }
  if (buf.trim()) statements.push(buf.trim().replace(/;$/, ''));
  return statements;
}

function computeChecksum(content: string): string {
  // Match Prisma's checksum format (sha256 hex)
  return createHash('sha256').update(content).digest('hex');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
