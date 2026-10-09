import { PrismaClient } from '@prisma/client';
import { env } from './env.js';

/**
 * One client per process. Serverless invocations reuse a warm module, so this
 * has to be a module-level singleton or a busy deployment opens a connection
 * per request and exhausts the pool.
 */
const globalForPrisma = globalThis as unknown as { okmemePrisma?: PrismaClient };

export const db: PrismaClient =
  globalForPrisma.okmemePrisma ??
  new PrismaClient({
    datasources: { db: { url: env().databaseUrl } },
    log: env().nodeEnv === 'development' ? ['warn', 'error'] : ['error'],
  });

if (env().nodeEnv !== 'production') globalForPrisma.okmemePrisma = db;

/** Postgres returns bigint for every serial pk. It never leaves the API. */
export function bigintToNumber(value: bigint): number {
  return Number(value);
}
