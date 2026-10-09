import { Hono, type Context } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { z } from 'zod';
import type { AppEnv } from '../app.js';
import { clientIp, loadSanction } from '../context.js';
import { db } from '../db.js';
import { env } from '../env.js';
import { ApiError, conflict, invalid, notFound, unauthenticated } from '../errors.js';
import { hashIp, hashToken, publicId } from '../lib/ids.js';
import { burnPasswordTime, verifyPassword } from '../lib/password.js';
import { authProvider } from '../ports/auth/index.js';
import { BUCKETS, limitByIp } from '../ratelimit.js';
import { mePayload } from '../serialize.js';
import {
  createAccount,
  createSession,
  revokeAllCredentials,
  revokeSession,
} from '../services/accounts.js';
import { audit } from '../services/audit.js';
import { unreadCount } from '../services/notify.js';
import { getSetting } from '../services/settings.js';
import { TIER } from '../tier.js';

/**
 * There is no email in any flow.
 *
 * Signup consumes an invite; account recovery spends a one-time code issued at
 * signup. Nothing sends mail, so nothing needs SMTP, deliverability, or bounce
 * handling — and a self-hoster needs a database and nothing else.
 */
export function authRoutes(): Hono<AppEnv> {
  const app = new Hono<AppEnv>();
  const config = env();

  function issueCookie(c: Context<AppEnv>, token: string, expiresAt: Date): void {
    setCookie(c, config.cookieName, token, {
      httpOnly: true,
      secure: config.cookieSecure,
      sameSite: config.cookieSecure ? 'None' : 'Lax',
      path: '/',
      expires: expiresAt,
      ...(config.cookieDomain !== null ? { domain: config.cookieDomain } : {}),
    });
  }

  async function sessionResponse(userId: bigint) {
    const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
    const sanction = await loadSanction(userId);
    return {
      payload: mePayload(
        {
          id: user.id,
          publicId: user.publicId,
          username: user.username ?? '',
          tier: user.tier,
          showNsfw: user.showNsfw,
          theme: user.theme,
          display: user.display,
          createdAt: user.createdAt,
        },
        await unreadCount(userId),
        sanction,
      ),
      sanction,
    };
  }

  /* -------------------------------------------------------------- signup */

  app.post('/auth/signup', async (c) => {
    const ip = clientIp(c);
    await limitByIp(BUCKETS.writes, ip);

    const body = z
      .object({
        username: z.string().trim().min(2).max(31),
        password: z.string().min(10).max(200),
        invite: z.string().trim().min(1),
      })
      .safeParse(await c.req.json().catch(() => ({})));
    if (!body.success) throw invalid('username, password and invite are required', 'invalid_body');

    if ((await getSetting('signup_open', true)) !== true) {
      throw new ApiError(403, 'signup_closed', 'signup is closed on this instance');
    }

    const invite = await db.invite.findUnique({ where: { codeHash: hashToken(body.data.invite) } });
    const now = new Date();
    if (
      invite === null ||
      invite.consumedAt !== null ||
      invite.revokedAt !== null ||
      invite.expiresAt < now
    ) {
      // One answer for wrong, spent, revoked and expired. Distinguishing them
      // would tell a stranger which codes had ever existed.
      throw invalid('that invite is not usable', 'bad_invite');
    }

    const account = await createAccount({
      username: body.data.username,
      password: body.data.password,
      tier: TIER.limited,
      invitedBy: invite.issuedBy,
    });

    await db.invite.update({
      where: { id: invite.id },
      data: { consumedBy: account.userId, consumedAt: now },
    });
    await audit({
      actorId: account.userId,
      action: 'invite.consumed',
      subjectType: 'invite',
      subjectId: String(invite.id),
      after: { user: account.publicId },
    });

    const session = await createSession(account.userId);
    issueCookie(c, session.token, session.expiresAt);

    const { payload } = await sessionResponse(account.userId);
    // The ten recovery codes are returned exactly once and never again.
    return c.json({ ...payload, recoveryCodes: account.recoveryCodes }, 201);
  });

  /* -------------------------------------------------------------- login */

  app.post('/auth/login', async (c) => {
    const ip = clientIp(c);
    await limitByIp(BUCKETS.writes, ip);

    const body = z
      .object({ username: z.string().trim().min(1), password: z.string().min(1) })
      .safeParse(await c.req.json().catch(() => ({})));
    if (!body.success) throw invalid('username and password are required', 'invalid_body');

    const username = body.data.username.toLowerCase();
    const user = await db.user.findFirst({
      where: { username, state: 'active' },
      include: { identities: { where: { provider: authProvider().name } } },
    });

    if (user === null) {
      // Same wall time as a real check, or the response is a username oracle.
      await burnPasswordTime();
      throw unauthenticated('that did not work');
    }

    const identity = user.identities[0];
    if (identity === undefined) {
      await burnPasswordTime();
      throw unauthenticated('that did not work');
    }

    const ok = await authProvider().verify(username, body.data.password, {
      subject: identity.subject,
      secret: identity.passwordHash,
    });
    if (!ok) throw unauthenticated('that did not work');

    // A locked-out user authenticates normally. The session they get is
    // authorised for exactly two things — reading the sanction and filing one
    // appeal — and the middleware enforces that. Refusing the login outright
    // would leave them with no channel at all.
    const session = await createSession(user.id);
    issueCookie(c, session.token, session.expiresAt);

    const { payload } = await sessionResponse(user.id);
    return c.json(payload);
  });

  app.post('/auth/logout', async (c) => {
    const token = getCookie(c, config.cookieName);
    if (token !== undefined && token !== '') await revokeSession(token);
    deleteCookie(c, config.cookieName, {
      path: '/',
      ...(config.cookieDomain !== null ? { domain: config.cookieDomain } : {}),
    });
    return c.body(null, 204);
  });

  /* -------------------------------------------------------------- recovery */

  /** Spends one of the ten codes and sets a new password. */
  app.post('/auth/recover', async (c) => {
    const ip = clientIp(c);
    await limitByIp(BUCKETS.recovery, ip);

    const body = z
      .object({
        username: z.string().trim().min(1),
        code: z.string().trim().min(1),
        password: z.string().min(10).max(200),
      })
      .safeParse(await c.req.json().catch(() => ({})));
    if (!body.success) throw invalid('username, code and a new password are required', 'invalid_body');

    const user = await db.user.findFirst({
      where: { username: body.data.username.toLowerCase(), state: 'active' },
      include: { identities: { where: { provider: authProvider().name } } },
    });
    if (user === null) {
      await burnPasswordTime();
      throw unauthenticated('that did not work');
    }

    const codes = await db.recoveryCode.findMany({ where: { userId: user.id, usedAt: null } });
    let matched: bigint | null = null;
    for (const candidate of codes) {
      if (await verifyPassword(body.data.code, candidate.codeHash)) {
        matched = candidate.id;
        break;
      }
    }
    if (matched === null) {
      await burnPasswordTime();
      throw unauthenticated('that did not work');
    }

    const identity = user.identities[0];
    if (identity === undefined) throw unauthenticated('that did not work');

    const next = await authProvider().reset(
      { subject: identity.subject, secret: identity.passwordHash },
      body.data.password,
    );

    await db.$transaction([
      db.recoveryCode.update({ where: { id: matched }, data: { usedAt: new Date() } }),
      db.identity.update({ where: { id: identity.id }, data: { passwordHash: next.secret } }),
      // A recovered account starts from zero sessions and zero live tokens.
      db.session.updateMany({ where: { userId: user.id }, data: { revokedAt: new Date() } }),
      db.apiToken.updateMany({ where: { userId: user.id }, data: { revokedAt: new Date() } }),
    ]);

    const session = await createSession(user.id);
    issueCookie(c, session.token, session.expiresAt);
    const { payload } = await sessionResponse(user.id);
    return c.json(payload);
  });

  /**
   * Filed by someone who has burned or lost all ten codes.
   *
   * The response is identical for every input and a row is written **only when
   * the named account actually exists**. Writing rows for unknown usernames
   * would turn the admin queue into a spam sink; answering differently would
   * make the endpoint a username oracle.
   */
  app.post('/auth/recovery-request', async (c) => {
    const ip = clientIp(c);
    await limitByIp(BUCKETS.recovery, ip);

    const body = z
      .object({ username: z.string().trim().min(1), note: z.string().max(2000).optional() })
      .safeParse(await c.req.json().catch(() => ({})));

    const identical = { ok: true, message: 'if that account exists, an admin has been notified' };

    if (!body.success) {
      await burnPasswordTime();
      return c.json(identical);
    }

    const user = await db.user.findFirst({
      where: { username: body.data.username.toLowerCase(), state: 'active' },
      select: { id: true },
    });

    if (user === null) {
      // Burn the same time a write would take. The answer above is the same
      // either way; only the timing could have differed.
      await burnPasswordTime();
      return c.json(identical);
    }

    await db.recoveryRequest
      .create({
        data: {
          userId: user.id,
          note: body.data.note ?? '',
          ipHash: hashIp(ip, config.ipSalt),
        },
      })
      // A partial unique index permits one open request per account. A second
      // one is not an error the caller gets to observe.
      .catch(() => undefined);

    return c.json(identical);
  });

  /* -------------------------------------------------------------- callback */

  /**
   * The Supabase provider's inbound leg. Both providers resolve through the
   * same `identities` mapping, so nothing downstream knows which one ran.
   */
  app.get('/auth/callback', async (c) => {
    const token = c.req.query('access_token') ?? '';
    if (token === '') throw invalid('no access token', 'invalid_body');

    const result = await authProvider().exchange(token);

    const identity = await db.identity.findUnique({
      where: { provider_subject: { provider: authProvider().name, subject: result.subject } },
    });

    if (identity === null) {
      // No implicit account creation. Signup is invite-only, and a provider
      // that will mint accounts on demand is a way around that.
      throw notFound('no account is linked to that identity');
    }

    const session = await createSession(identity.userId);
    issueCookie(c, session.token, session.expiresAt);

    const { payload } = await sessionResponse(identity.userId);
    return c.json(payload);
  });

  /* -------------------------------------------------------------- password */

  app.post('/auth/password', async (c) => {
    const viewer = c.get('viewer');
    if (viewer.user === null) throw unauthenticated();

    const body = z
      .object({ current: z.string().min(1), next: z.string().min(10).max(200) })
      .safeParse(await c.req.json().catch(() => ({})));
    if (!body.success) throw invalid('current and next passwords are required', 'invalid_body');

    const identity = await db.identity.findFirst({
      where: { userId: viewer.user.id, provider: authProvider().name },
    });
    if (identity === null) throw conflict('no_local_identity', 'this account has no password');

    const ok = await authProvider().verify(viewer.user.username, body.data.current, {
      subject: identity.subject,
      secret: identity.passwordHash,
    });
    if (!ok) throw unauthenticated('that did not work');

    const next = await authProvider().reset(
      { subject: identity.subject, secret: identity.passwordHash },
      body.data.next,
    );
    await db.identity.update({ where: { id: identity.id }, data: { passwordHash: next.secret } });
    await revokeAllCredentials(viewer.user.id);

    const session = await createSession(viewer.user.id);
    issueCookie(c, session.token, session.expiresAt);
    return c.body(null, 204);
  });

  return app;
}
