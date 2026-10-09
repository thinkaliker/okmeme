/**
 * Configuration is the whole portability story. Every backend service sits
 * behind a port with at least two implementations, so moving between Vercel and
 * a box you own is a change of environment variables rather than a fork.
 */

function required(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === '') {
    throw new Error(`missing required environment variable: ${name}`);
  }
  return value;
}

function optional(name: string, fallback: string): string {
  const value = process.env[name];
  return value === undefined || value === '' ? fallback : value;
}

function bool(name: string, fallback: boolean): boolean {
  const value = process.env[name];
  if (value === undefined || value === '') return fallback;
  return value === '1' || value.toLowerCase() === 'true';
}

function int(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export type AuthProviderName = 'local' | 'supabase';
export type BlobStoreName = 'local-fs' | 's3' | 'supabase-storage' | 'none';

const BLOB_STORES: readonly BlobStoreName[] = ['local-fs', 's3', 'supabase-storage', 'none'];

export interface Env {
  readonly databaseUrl: string;
  readonly authProvider: AuthProviderName;
  readonly blobStore: BlobStoreName;

  /** Where this API is reachable. Used to build absolute URLs in the OG card. */
  readonly publicUrl: string;
  /** Origins allowed to send credentialed requests. The SPA is one of them. */
  readonly webOrigins: readonly string[];

  readonly port: number;
  readonly cookieName: string;
  readonly cookieDomain: string | null;
  readonly cookieSecure: boolean;
  readonly sessionTtlDays: number;

  /** Unlocks /setup exactly once. Inert after settings.setup_complete is true. */
  readonly setupToken: string | null;

  readonly blobDir: string;
  readonly s3: {
    readonly bucket: string;
    readonly region: string;
    readonly endpoint: string | null;
    readonly accessKeyId: string;
    readonly secretAccessKey: string;
    readonly forcePathStyle: boolean;
  };
  readonly supabase: {
    readonly url: string;
    readonly serviceKey: string;
    readonly jwtSecret: string;
    readonly bucket: string;
  };

  /** Behind a proxy, the client IP comes from a header rather than the socket. */
  readonly trustProxy: boolean;
  readonly ipSalt: string;

  /** Cap on a fetched thumbnail before resize, in bytes. */
  readonly maxFetchBytes: number;
  readonly fetchTimeoutMs: number;
  /** Off by default: fetching arbitrary URLs from a private network is an SSRF. */
  readonly allowPrivateFetch: boolean;

  readonly nodeEnv: string;
}

let cached: Env | null = null;

export function env(): Env {
  if (cached !== null) return cached;

  const authProvider = optional('AUTH_PROVIDER', 'local');
  if (authProvider !== 'local' && authProvider !== 'supabase') {
    throw new Error(`AUTH_PROVIDER must be "local" or "supabase", got "${authProvider}"`);
  }

  const blobStore = optional('BLOB_STORE', 'local-fs') as BlobStoreName;
  if (!BLOB_STORES.includes(blobStore)) {
    throw new Error(`BLOB_STORE must be one of ${BLOB_STORES.join(', ')}`);
  }

  cached = {
    databaseUrl: required('DATABASE_URL'),
    authProvider,
    blobStore,

    publicUrl: optional('PUBLIC_URL', 'http://localhost:8787').replace(/\/+$/, ''),
    webOrigins: optional('WEB_ORIGIN', 'http://localhost:5173')
      .split(',')
      .map((value) => value.trim().replace(/\/+$/, ''))
      .filter((value) => value !== ''),

    port: int('PORT', 8787),
    cookieName: optional('COOKIE_NAME', 'okm_session'),
    cookieDomain: process.env['COOKIE_DOMAIN'] || null,
    cookieSecure: bool('COOKIE_SECURE', optional('NODE_ENV', 'development') === 'production'),
    sessionTtlDays: int('SESSION_TTL_DAYS', 30),

    setupToken: process.env['SETUP_TOKEN'] || null,

    blobDir: optional('BLOB_DIR', './.blobs'),
    s3: {
      bucket: optional('S3_BUCKET', ''),
      region: optional('S3_REGION', 'us-east-1'),
      endpoint: process.env['S3_ENDPOINT'] || null,
      accessKeyId: optional('S3_ACCESS_KEY_ID', ''),
      secretAccessKey: optional('S3_SECRET_ACCESS_KEY', ''),
      forcePathStyle: bool('S3_FORCE_PATH_STYLE', false),
    },
    supabase: {
      url: optional('SUPABASE_URL', '').replace(/\/+$/, ''),
      serviceKey: optional('SUPABASE_SERVICE_ROLE_KEY', ''),
      jwtSecret: optional('SUPABASE_JWT_SECRET', ''),
      bucket: optional('SUPABASE_STORAGE_BUCKET', 'okmeme'),
    },

    trustProxy: bool('TRUST_PROXY', true),
    ipSalt: optional('IP_SALT', 'okmeme-dev-salt'),

    maxFetchBytes: int('MAX_FETCH_BYTES', 5 * 1024 * 1024),
    fetchTimeoutMs: int('FETCH_TIMEOUT_MS', 8000),
    allowPrivateFetch: bool('ALLOW_PRIVATE_FETCH', false),

    nodeEnv: optional('NODE_ENV', 'development'),
  };

  return cached;
}

/** Tests swap the whole object rather than poking at process.env. */
export function resetEnv(): void {
  cached = null;
}
