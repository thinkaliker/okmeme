import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { env } from './env.js';

/**
 * One client per process. Serverless invocations reuse a warm module, so this
 * has to be a module-level singleton or a busy deployment opens a connection
 * per request and exhausts the pool.
 *
 * Prisma 7 talks to Postgres through node-postgres rather than its own engine.
 * Two things changed with that. The pool gives up on connecting after five
 * seconds, as Prisma 6 did; node-postgres would otherwise wait forever, and a
 * serverless function would spend its whole time limit on a database that is
 * down. And `sslmode=require` now checks the server's certificate, where Prisma 6
 * only encrypted the connection.
 */
const globalForPrisma = globalThis as unknown as { okmemePrisma?: PrismaClient };

export const db: PrismaClient =
  globalForPrisma.okmemePrisma ??
  new PrismaClient({
    adapter: new PrismaPg({
      connectionString: env().databaseUrl,
      connectionTimeoutMillis: 5_000,
    }),
    log: env().nodeEnv === 'development' ? ['warn', 'error'] : ['error'],
  });

if (env().nodeEnv !== 'production') globalForPrisma.okmemePrisma = db;

/** Postgres returns bigint for every serial pk. It never leaves the API. */
export function bigintToNumber(value: bigint): number {
  return Number(value);
}
