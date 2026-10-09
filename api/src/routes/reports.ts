import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../app.js';
import { requireUser } from '../context.js';
import { db } from '../db.js';
import { invalid } from '../errors.js';
import { publicId } from '../lib/ids.js';
import { BUCKETS, limit } from '../ratelimit.js';
import { findVisibleLink } from '../visibility.js';

const schema = z.object({
  subject: z.object({
    type: z.enum(['link', 'user']),
    publicId: z.string().trim().min(1),
  }),
  reason: z.enum(['spam', 'abuse', 'nsfw', 'other']),
  note: z.string().max(2000).optional().default(''),
});

/**
 * One queue, regardless of what was reported or who authored it — including
 * reports about admins, which GAPS.md records as accepted: admins are
 * self-policing, and the only external checks are the audit log, the revision
 * history, and the owner set.
 *
 * The response confirms acceptance and nothing about the subject. A report that
 * answered "no such post" would be a probe for content above the reporter's
 * tier.
 */
export function reportRoutes(): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  app.post('/reports', async (c) => {
    const viewer = c.get('viewer');
    const user = requireUser(viewer);
    await limit(BUCKETS.reports, viewer);

    const parsed = schema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) throw invalid('a report needs a subject and a reason', 'invalid_body');
    const { subject, reason, note } = parsed.data;

    const accepted = c.body(null, 204);

    if (subject.type === 'link') {
      const row = await findVisibleLink(viewer, subject.publicId);
      // Unreportable and invisible produce the same answer: acceptance.
      if (row === null) return accepted;

      await db.report.create({
        data: {
          publicId: publicId('r'),
          subjectType: 'link',
          subjectId: row.id,
          // Never exposed to the reported party, at any tier.
          reporterId: user.id,
          reason,
          note,
        },
      });
      return accepted;
    }

    const target = await db.user.findFirst({
      where: { publicId: subject.publicId, state: 'active' },
      select: { id: true, tier: true },
    });
    // Reporting a user the reporter cannot see is the same non-event.
    if (target === null || target.tier > viewer.tier + 1) return accepted;

    await db.report.create({
      data: {
        publicId: publicId('r'),
        subjectType: 'user',
        subjectId: target.id,
        reporterId: user.id,
        reason,
        note,
      },
    });

    return accepted;
  });

  return app;
}
