import { readFile, readdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { db } from '../db.js';

/**
 * A migration runner in eighty lines, because Prisma Migrate cannot express
 * three things this schema depends on: the partial unique index that allows one
 * open recovery request per account, the append-only trigger on `audit_log`,
 * and the tsvector maintained from two tables.
 *
 * Files are applied once, in filename order, each inside a transaction, with a
 * record in `_migrations`.
 */

const MIGRATIONS_DIR = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'migrations',
);

/**
 * Splits a file into statements while respecting dollar-quoted bodies —
 * `CREATE FUNCTION ... $$ ... ; ... $$` is one statement, and naive splitting on
 * a semicolon turns it into four broken ones.
 */
export function splitStatements(sql: string): string[] {
  const statements: string[] = [];
  let current = '';
  let index = 0;
  let dollarTag: string | null = null;

  while (index < sql.length) {
    const char = sql[index]!;

    if (dollarTag === null) {
      // Line comment
      if (char === '-' && sql[index + 1] === '-') {
        const end = sql.indexOf('\n', index);
        index = end === -1 ? sql.length : end + 1;
        continue;
      }
      // Block comment
      if (char === '/' && sql[index + 1] === '*') {
        const end = sql.indexOf('*/', index);
        index = end === -1 ? sql.length : end + 2;
        continue;
      }
      // Single-quoted literal
      if (char === "'") {
        const end = sql.indexOf("'", index + 1);
        const stop = end === -1 ? sql.length : end + 1;
        current += sql.slice(index, stop);
        index = stop;
        continue;
      }
      const tag = /^\$[A-Za-z_]*\$/.exec(sql.slice(index));
      if (tag !== null) {
        dollarTag = tag[0];
        current += dollarTag;
        index += dollarTag.length;
        continue;
      }
      if (char === ';') {
        if (current.trim() !== '') statements.push(current.trim());
        current = '';
        index += 1;
        continue;
      }
    } else if (sql.startsWith(dollarTag, index)) {
      current += dollarTag;
      index += dollarTag.length;
      dollarTag = null;
      continue;
    }

    current += char;
    index += 1;
  }

  if (current.trim() !== '') statements.push(current.trim());
  return statements;
}

export async function migrate(directory = MIGRATIONS_DIR): Promise<string[]> {
  await db.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS _migrations (
      name text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  const applied = new Set(
    (await db.$queryRawUnsafe<{ name: string }[]>('SELECT name FROM _migrations')).map(
      (row) => row.name,
    ),
  );

  const files = (await readdir(directory)).filter((name) => name.endsWith('.sql')).sort();
  const ran: string[] = [];

  for (const file of files) {
    if (applied.has(file)) continue;

    const sql = await readFile(join(directory, file), 'utf8');
    const statements = splitStatements(sql);

    await db.$transaction(async (tx) => {
      for (const statement of statements) await tx.$executeRawUnsafe(statement);
      await tx.$executeRawUnsafe('INSERT INTO _migrations (name) VALUES ($1)', file);
    });

    ran.push(file);
  }

  return ran;
}
