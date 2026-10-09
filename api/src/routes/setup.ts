import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../app.js';
import { clientIp } from '../context.js';
import { env } from '../env.js';
import { invalid, notFound } from '../errors.js';
import { safeEqual } from '../lib/ids.js';
import { BUCKETS, limitByIp } from '../ratelimit.js';
import { bootstrap } from '../services/setup.js';
import { isSetupComplete } from '../services/settings.js';

/**
 * One time, ever.
 *
 * Available only while `settings.setup_complete` is false **and** `SETUP_TOKEN`
 * is set; 404s permanently afterwards, so a leaked token on a live instance is
 * inert. This is the only bootstrap path on Vercel, which gives you no shell —
 * `okmeme init` is the equivalent everywhere else.
 */
export function setupRoutes(): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  async function assertAvailable(token: string | undefined): Promise<void> {
    const expected = env().setupToken;
    // Both conditions produce the same 404. Neither the token's absence nor a
    // completed setup is worth confirming to whoever is asking.
    if (expected === null) throw notFound('no such route');
    if (await isSetupComplete()) throw notFound('no such route');
    if (token === undefined || !safeEqual(token, expected)) throw notFound('no such route');
  }

  app.get('/setup', async (c) => {
    await limitByIp(BUCKETS.setup, clientIp(c));
    await assertAvailable(c.req.query('token'));
    return c.json({
      available: true,
      // Stated here so the page can say it before anyone types a password.
      creates: ['owner', 'admin'],
      note: 'Both sets of recovery codes are displayed once and cannot be shown again.',
      // Whether a blob store was configured at all. The page uses it to offer
      // thumbnails as a choice or to show them as unavailable, rather than
      // accepting an answer the deployment cannot honour.
      blobStore: env().blobStore !== 'none',
    });
  });

  app.post('/setup', async (c) => {
    await limitByIp(BUCKETS.setup, clientIp(c));

    const body = z
      .object({
        token: z.string().min(1),
        ownerUsername: z.string().trim().min(2).max(31),
        ownerPassword: z.string().min(10).max(200),
        adminUsername: z.string().trim().min(2).max(31),
        adminPassword: z.string().min(10).max(200),
        // Optional: an older client that does not send it gets thumbnails on,
        // which is what every instance created before the field had.
        thumbnails: z.boolean().optional(),
      })
      .safeParse(await c.req.json().catch(() => ({})));
    if (!body.success) throw invalid('two usernames and two passwords are required', 'invalid_body');

    await assertAvailable(body.data.token);

    if (body.data.ownerUsername.toLowerCase() === body.data.adminUsername.toLowerCase()) {
      throw invalid('the owner and the admin are two different accounts', 'invalid_body');
    }

    const result = await bootstrap({
      ...body.data,
      // Absent means on, and a store that cannot serve them overrules a yes.
      thumbnails: body.data.thumbnails !== false && env().blobStore !== 'none',
    });

    return c.json(
      {
        owner: {
          username: result.owner.username,
          publicId: result.owner.publicId,
          recoveryCodes: result.owner.recoveryCodes,
        },
        admin: {
          username: result.admin.username,
          publicId: result.admin.publicId,
          recoveryCodes: result.admin.recoveryCodes,
        },
      },
      201,
    );
  });

  return app;
}
