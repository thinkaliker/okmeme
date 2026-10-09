import { db } from '../db.js';
import { env } from '../env.js';
import { forbidden } from '../errors.js';
import { audit } from './audit.js';

/**
 * Instance settings, with a per-key minimum writer tier so a setting can
 * require more than admin.
 *
 * `invite_min_tier` is the reason that column exists. It is owner-writable
 * only: lowering it below admin converts the invite table into a permanent
 * cross-tier identity graph, which no amount of label-hiding fixes and which
 * raising the value back does not unbuild. See VISIBILITY.md.
 */

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const row = await db.setting.findUnique({ where: { key } });
  return row === null ? fallback : (row.value as T);
}

export async function allSettings(): Promise<Record<string, unknown>> {
  const rows = await db.setting.findMany({ orderBy: { key: 'asc' } });
  return Object.fromEntries(rows.map((row) => [row.key, row.value]));
}

export async function settingsWithTiers(): Promise<
  { key: string; value: unknown; minWriterTier: number; updatedAt: string }[]
> {
  const rows = await db.setting.findMany({ orderBy: { key: 'asc' } });
  return rows.map((row) => ({
    key: row.key,
    value: row.value,
    minWriterTier: row.minWriterTier,
    updatedAt: row.updatedAt.toISOString(),
  }));
}

export async function setSetting(
  key: string,
  value: unknown,
  actor: { id: bigint; tier: number },
): Promise<void> {
  const existing = await db.setting.findUnique({ where: { key } });
  const minWriterTier = existing?.minWriterTier ?? 4;

  if (actor.tier < minWriterTier) throw forbidden('this setting requires a higher tier');

  await db.setting.upsert({
    where: { key },
    update: { value: value as never, updatedBy: actor.id, updatedAt: new Date() },
    create: { key, value: value as never, minWriterTier, updatedBy: actor.id },
  });

  await audit({
    actorId: actor.id,
    action: 'settings.updated',
    subjectType: 'setting',
    subjectId: key,
    before: existing?.value ?? null,
    after: value,
  });
}

export const isSetupComplete = (): Promise<boolean> => getSetting('setup_complete', false);

export const inviteMinTier = (): Promise<number> => getSetting('invite_min_tier', 4);

export const inviteTtlDays = (): Promise<number> => getSetting('invite_ttl_days', 14);

/**
 * Thumbnails and favicons, off or on. Two switches, because they answer two
 * different questions:
 *
 * - `BLOB_STORE=none` says there is nowhere to put bytes. Deployment shape.
 * - `thumbnails_enabled` says an instance with somewhere to put them would
 *   rather not. Admin preference, flipped at runtime with no redeploy.
 *
 * Either one off means off, so an admin cannot switch on a feature the
 * deployment cannot serve. Turning it back on affects new submissions
 * immediately; posts made while it was off keep a null `thumb_key` until
 * `okmeme backfill-thumbs` derives them, because a key is only written at
 * submission.
 */
export async function thumbnailsEnabled(): Promise<boolean> {
  if (env().blobStore === 'none') return false;
  return getSetting('thumbnails_enabled', true);
}
