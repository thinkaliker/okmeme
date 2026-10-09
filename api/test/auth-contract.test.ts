import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createLocalAuthProvider } from '../src/ports/auth/local.js';
import { createSupabaseAuthProvider, verifyAccessToken } from '../src/ports/auth/supabase.js';
import type { AuthProvider } from '../src/ports/auth/index.js';

/**
 * One suite, both implementations.
 *
 * DESIGN.md is explicit that both auth providers are built from the start and
 * that both must pass the same contract tests — an abstraction with one
 * implementation is a guess. Supabase runs against an in-memory GoTrue double
 * so this suite needs no network and no project, which is what makes it a CI
 * gate rather than a thing someone runs manually once.
 */

const JWT_SECRET = 'contract-suite-secret';

interface StubUser {
  id: string;
  email: string;
  password: string;
}

/** The three GoTrue endpoints the adapter touches, and nothing else. */
function stubGoTrue(): typeof fetch {
  const users = new Map<string, StubUser>();
  let nextId = 1;

  return (async (
    input: Parameters<typeof fetch>[0],
    init?: RequestInit,
  ): Promise<Response> => {
    const url = new URL(typeof input === 'string' ? input : input.toString());
    const body = init?.body === undefined ? {} : (JSON.parse(String(init.body)) as Record<string, unknown>);
    const json = (value: unknown, status = 200): Response =>
      new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });

    if (url.pathname === '/auth/v1/admin/users' && init?.method === 'POST') {
      const email = String(body['email']);
      if ([...users.values()].some((user) => user.email === email)) {
        return json({ msg: 'already registered' }, 400);
      }
      const user: StubUser = {
        id: `gotrue-${nextId++}`,
        email,
        password: String(body['password']),
      };
      users.set(user.id, user);
      return json({ id: user.id, email: user.email });
    }

    if (url.pathname === '/auth/v1/token' && url.searchParams.get('grant_type') === 'password') {
      const match = [...users.values()].find(
        (user) => user.email === String(body['email']) && user.password === String(body['password']),
      );
      return match === undefined
        ? json({ msg: 'invalid credentials' }, 400)
        : json({ access_token: 'stub' });
    }

    const put = /^\/auth\/v1\/admin\/users\/(.+)$/.exec(url.pathname);
    if (put !== null && init?.method === 'PUT') {
      const user = users.get(decodeURIComponent(put[1]!));
      if (user === undefined) return json({ msg: 'not found' }, 404);
      user.password = String(body['password']);
      return json({ id: user.id, email: user.email });
    }

    return json({}, 200);
  }) as typeof fetch;
}

const providers: readonly (readonly [string, () => AuthProvider])[] = [
  ['local', () => createLocalAuthProvider()],
  [
    'supabase',
    () =>
      createSupabaseAuthProvider({
        fetchImpl: stubGoTrue(),
        url: 'https://stub.supabase.co',
        serviceKey: 'service-key',
        jwtSecret: JWT_SECRET,
        userDomain: 'users.okmeme.invalid',
      }),
  ],
];

describe.each(providers)('AuthProvider contract: %s', (_name, build) => {
  it('provisions a credential and verifies the password it was given', async () => {
    const provider = build();
    const credential = await provider.provision('dana', 'correct horse battery');
    expect(credential.subject).not.toBe('');
    await expect(
      provider.verify('dana', 'correct horse battery', credential),
    ).resolves.toBe(true);
  });

  it('rejects the wrong password', async () => {
    const provider = build();
    const credential = await provider.provision('dana', 'correct horse battery');
    await expect(provider.verify('dana', 'wrong password!!', credential)).resolves.toBe(false);
  });

  it('never returns the password in the credential', async () => {
    const provider = build();
    const credential = await provider.provision('dana', 'correct horse battery');
    expect(credential.secret ?? '').not.toContain('correct horse battery');
  });

  it('resets to a new password and invalidates the old one', async () => {
    const provider = build();
    const credential = await provider.provision('dana', 'correct horse battery');
    const next = await provider.reset(credential, 'a different passphrase');

    await expect(provider.verify('dana', 'a different passphrase', next)).resolves.toBe(true);
    await expect(provider.verify('dana', 'correct horse battery', next)).resolves.toBe(false);
  });

  it('keeps the subject stable across a reset, because identities key on it', async () => {
    const provider = build();
    const credential = await provider.provision('dana', 'correct horse battery');
    const next = await provider.reset(credential, 'a different passphrase');
    expect(next.subject).toBe(credential.subject);
  });

  it('survives revoke being called', async () => {
    const provider = build();
    const credential = await provider.provision('dana', 'correct horse battery');
    await expect(provider.revoke(credential)).resolves.toBeUndefined();
  });
});

describe('local provider specifics', () => {
  it('has no callback flow', async () => {
    await expect(createLocalAuthProvider().exchange('anything')).rejects.toThrow();
  });

  it('fails closed when the stored hash is missing', async () => {
    const provider = createLocalAuthProvider();
    await expect(provider.verify('dana', 'x', { subject: 'dana', secret: null })).resolves.toBe(
      false,
    );
  });
});

describe('supabase access tokens', () => {
  const sign = (payload: Record<string, unknown>, secret = JWT_SECRET): string => {
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature = createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url');
    return `${header}.${body}.${signature}`;
  };

  it('accepts a well-signed token and returns the subject', () => {
    const token = sign({ sub: 'gotrue-1', exp: Math.floor(Date.now() / 1000) + 60 });
    expect(verifyAccessToken(token, JWT_SECRET).subject).toBe('gotrue-1');
  });

  it('rejects a token signed with the wrong key', () => {
    const token = sign({ sub: 'gotrue-1' }, 'not-the-secret');
    expect(() => verifyAccessToken(token, JWT_SECRET)).toThrow();
  });

  it('rejects an expired token', () => {
    const token = sign({ sub: 'gotrue-1', exp: Math.floor(Date.now() / 1000) - 60 });
    expect(() => verifyAccessToken(token, JWT_SECRET)).toThrow();
  });

  it('rejects alg: none, which is the classic bypass', () => {
    const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const body = Buffer.from(JSON.stringify({ sub: 'gotrue-1' })).toString('base64url');
    expect(() => verifyAccessToken(`${header}.${body}.`, JWT_SECRET)).toThrow();
  });
});
