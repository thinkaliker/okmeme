import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { db } from './db.js';
import { env } from './env.js';
import { migrate } from './lib/migrate.js';
import { deriveAtSubmit } from './services/media.js';
import { bootstrap } from './services/setup.js';
import { isSetupComplete, thumbnailsEnabled } from './services/settings.js';
import { unfurl } from './services/unfurl.js';
import { pruneRateLimits } from './ratelimit.js';

/**
 * `okmeme init` — the bootstrap path for deployments that have a shell.
 *
 * It does exactly what `POST /setup` does, guarded by the same
 * `settings.setup_complete` flag inside the same transaction, because a race
 * between the two would be a very bad day.
 */

async function ask(question: string, secret = false): Promise<string> {
  const rl = createInterface({ input: stdin, output: stdout, terminal: true });
  if (!secret) {
    const answer = await rl.question(question);
    rl.close();
    return answer.trim();
  }

  // Echo off. Not a security boundary — it stops a password landing in a
  // screen share or a scrollback buffer.
  const output = stdout as unknown as { write: (chunk: string) => boolean };
  const original = output.write.bind(output);
  let muted = false;
  output.write = (chunk: string) => (muted ? true : original(chunk));
  const promise = rl.question(question);
  muted = true;
  const answer = await promise;
  muted = false;
  output.write = original;
  stdout.write('\n');
  rl.close();
  return answer.trim();
}

function printCodes(label: string, username: string, codes: readonly string[]): void {
  console.log(`\n  ${label}: ${username}`);
  console.log('  recovery codes (shown once, never again):');
  for (const code of codes) console.log(`    ${code}`);
}

async function init(flags: ReadonlySet<string>): Promise<void> {
  console.log('okmeme init\n');

  const ran = await migrate();
  for (const name of ran) console.log(`  applied ${name}`);

  if (await isSetupComplete()) {
    console.error('\nThis instance is already set up. Nothing to do.');
    process.exitCode = 1;
    return;
  }

  console.log(
    '\nTwo accounts are created: an owner and an admin.\n' +
      'An owner cannot post and an admin is the only tier that issues invites,\n' +
      'so an instance with only an owner can never gain a user.\n',
  );

  // A deployment with no blob store cannot serve thumbnails whatever is typed
  // here, so it is told rather than asked.
  const hasStore = env().blobStore !== 'none';
  const thumbnails = hasStore && !flags.has('--no-thumbnails');
  if (!hasStore) {
    console.log('BLOB_STORE=none, so thumbnails are off. Set a store and\n' +
      'flip thumbnails_enabled in the admin settings to turn them on.\n');
  } else if (!thumbnails) {
    console.log('Thumbnails off. Flip thumbnails_enabled in the admin settings\n' +
      'to turn them on, then run `okmeme backfill-thumbs`.\n');
  }

  const ownerUsername = process.env['OWNER_USERNAME'] ?? (await ask('owner username: '));
  const ownerPassword = process.env['OWNER_PASSWORD'] ?? (await ask('owner password: ', true));
  const adminUsername = process.env['ADMIN_USERNAME'] ?? (await ask('admin username: '));
  const adminPassword = process.env['ADMIN_PASSWORD'] ?? (await ask('admin password: ', true));

  const result = await bootstrap({
    ownerUsername,
    ownerPassword,
    adminUsername,
    adminPassword,
    thumbnails,
  });

  console.log('\nDone.');
  printCodes('owner', result.owner.username, result.owner.recoveryCodes);
  printCodes('admin', result.admin.username, result.admin.recoveryCodes);
  console.log(
    '\nWrite these down now. There is no email on this instance, so a lost set\n' +
      'of codes is recoverable only by another admin.\n',
  );
}

/**
 * `okmeme backfill-thumbs` — what makes turning thumbnails back on retroactive.
 *
 * A thumbnail key is written at submission, so posts made while thumbnails were
 * off carry a null one and would stay blank forever. This walks those posts and
 * derives what it can. Everything else about it is already true elsewhere: the
 * fetch is server-side, keys are derived rather than random, and a link whose
 * target has no preview image is an ordinary link rather than a failure.
 *
 * Sequential and interruptible on purpose. It is talking to a few hundred other
 * people's servers, and it is safe to run again — the query only ever picks up
 * what is still missing.
 */
async function backfillThumbs(max: number): Promise<void> {
  if (!(await thumbnailsEnabled())) {
    console.error(
      'Thumbnails are off on this instance. Turn them on first:\n' +
        '  BLOB_STORE must not be "none", and settings.thumbnails_enabled must be true.',
    );
    process.exitCode = 1;
    return;
  }

  const links = await db.link.findMany({
    where: { removedAt: null, thumbKey: null, url: { not: null } },
    orderBy: { createdAt: 'desc' },
    select: { publicId: true, url: true, host: true },
    take: max,
  });

  console.log(`${links.length} link(s) with no thumbnail. Fetching.`);

  let derived = 0;
  for (const link of links) {
    if (link.url === null) continue;
    try {
      const meta = await unfurl(link.url);
      const keys = await deriveAtSubmit(
        link.publicId,
        meta.imageUrl,
        meta.faviconUrl,
        link.host ?? '',
      );
      if (keys.thumbKey === null && keys.faviconKey === null) continue;
      await db.link.update({
        where: { publicId: link.publicId },
        data: { thumbKey: keys.thumbKey, faviconKey: keys.faviconKey },
      });
      derived += 1;
      console.log(`  ${link.publicId}`);
    } catch {
      // One unreachable host is not a reason to abandon the other four hundred.
    }
  }

  console.log(`\nDone. ${derived} updated, ${links.length - derived} had nothing to fetch.`);
}

function flagValue(argv: readonly string[], name: string, fallback: number): number {
  const index = argv.indexOf(name);
  if (index === -1) return fallback;
  const value = Number(argv[index + 1]);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

const command = process.argv[2];
const argv = process.argv.slice(3);
const flags = new Set(argv.filter((value) => value.startsWith('--')));

switch (command) {
  case 'init':
    await init(flags);
    break;
  case 'migrate': {
    const ran = await migrate();
    console.log(ran.length === 0 ? 'already up to date' : ran.join('\n'));
    break;
  }
  case 'backfill-thumbs':
    await backfillThumbs(flagValue(argv, '--limit', 500));
    break;
  case 'prune-rate-limits':
    await pruneRateLimits();
    console.log('done');
    break;
  default:
    console.log(
      'usage: okmeme <command>\n\n' +
        '  init [--no-thumbnails]        create the owner and the admin\n' +
        '  migrate                       apply pending migrations\n' +
        '  backfill-thumbs [--limit N]   derive thumbnails for posts that have none\n' +
        '  prune-rate-limits             drop expired rate limit buckets\n',
    );
    process.exitCode = 1;
}

await db.$disconnect();
