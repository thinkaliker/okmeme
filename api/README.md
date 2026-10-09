# okmeme api

REST over JSON. Hono on Node, Postgres 15+ through Prisma, no email provider
anywhere in it. The design documents in the repository root are the spec:
[DESIGN.md](../DESIGN.md), [VISIBILITY.md](../VISIBILITY.md),
[SCHEMA.md](../SCHEMA.md), [API.md](../API.md), [GAPS.md](../GAPS.md).

The same application object serves both deployment shapes.
[`src/server.ts`](src/server.ts) wraps it for a box you own,
[`api/index.ts`](api/index.ts) wraps it for Vercel. There is one app and two
thin adapters, so the two cannot quietly drift apart.

```text
src/
  app.ts          the application: middleware chain, then routes
  context.ts      who is asking — cookie or bearer, both resolving to a tier
  visibility.ts   the ring predicate, in SQL, in one place
  serialize.ts    the wire shape; the only place identity is resolved
  tier.ts         ordinals, the +1 rule, capabilities
  ratelimit.ts    fixed windows, in Postgres because serverless shares no memory
  routes/         one file per surface
  services/       the work behind the routes
  ports/          auth (local, supabase) and blob (local-fs, s3, supabase)
migrations/       hand-written SQL; the schema of record
prisma/           the client, generated from the same tables
```

---

## Quick start

```sh
cd api
cp .env.example .env          # edit DATABASE_URL at minimum
npm install
npm run generate              # prisma client
npm run migrate               # apply migrations/*.sql
npm run init                  # creates the owner and the admin, prints codes
npm run dev                   # http://localhost:8787
```

`npm run init` prints twenty recovery codes — ten per account — once. Write them
down. There is no email on this instance, so a lost set is recoverable only by
another admin.

The `dev`, `migrate` and `init` scripts read `.env` through Node's own
`--env-file-if-exists`; there is no dotenv dependency. `npm start` does not —
production takes its environment from systemd, Docker, or the platform.

Then, in another terminal:

```sh
cd web
npm install
VITE_API_MOCK=false VITE_API_URL=http://localhost:8787 npm run dev
```

---

## Deploying

Moved: **[DEPLOY.md](../DEPLOY.md)** in the repository root has step-by-step
instructions for Vercel, Docker Compose and bare metal, including which buttons
to click, what to verify at each stage, and a troubleshooting section.

The rest of this file is about developing against the API rather than running
it in production.

---

## Ports

Every backend service sits behind a port with at least two implementations, so
moving between deployments is a change of environment variables rather than a
fork.

### Auth providers

`AUTH_PROVIDER=local` — argon2id and opaque session cookies. Nothing leaves the
instance. This is the default and needs no configuration.

`AUTH_PROVIDER=supabase` — GoTrue behind the same port. Needs `SUPABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY` and `SUPABASE_JWT_SECRET`.

Two details are adapter work rather than configuration. okmeme has no email and
GoTrue insists on one, so usernames map to synthetic addresses under
`SUPABASE_USER_DOMAIN`; nothing is ever delivered to them. And
`identities.subject` is the GoTrue **user id**, not the email — the email is
derived and could be rewritten, the id is the thing worth mapping.

Both implementations run the same contract suite in
[`test/auth-contract.test.ts`](test/auth-contract.test.ts), with Supabase
against an in-memory GoTrue double so the suite needs no project and no network.

### Blob stores

The blob store is a **cache, not a store of record**. Every derivative is
recomputable from the source URL recorded on the link, so a database-only
restore is complete rather than merely valid.

| `BLOB_STORE` | needs |
| --- | --- |
| `local-fs` | `BLOB_DIR` (default `./.blobs`). A volume if you want it to survive a restart. |
| `s3` | `S3_BUCKET`, `S3_REGION`, credentials. `S3_ENDPOINT` + `S3_FORCE_PATH_STYLE=true` for R2, B2, MinIO, Spaces. |
| `supabase-storage` | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_STORAGE_BUCKET`. |

Keep the bucket **private**. Objects are read back through okmeme's own
`/thumb/:key` — a viewer's browser must never resolve a foreign host, which is
the same rule that rules out hotlinking the original image.

`@aws-sdk/client-s3` and `sharp` are optional dependencies, imported lazily. A
deployment on `local-fs` never loads the S3 client, and without `sharp` the
derivative is the original bytes rather than a resized WebP — larger, but not
broken.

---

## Backup and restore

Moved: **[DEPLOY.md § Back it up](../DEPLOY.md#back-it-up)**. The short version
is `pg_dump` and nothing else — the blob store is a cache, and every derivative
is recomputable from the source URL recorded on the link.

---

## Operations

**Rate limits** are fixed windows in a `rate_limits` table, because a serverless
deployment shares no memory between invocations. Old rows are harmless; prune
them on a timer if you like:

```sh
node dist/cli.js prune-rate-limits
```

**Thumbnails** are switchable. `BLOB_STORE=none` means there is nowhere to keep
bytes; `settings.thumbnails_enabled` means an instance that has somewhere would
rather not. Either off means off, so an admin cannot enable what the deployment
cannot serve. `okmeme init --no-thumbnails` sets it at install, the admin
settings panel flips it afterwards, and posts made while it was off need one
command, because a key is written at submission and nothing revisits old rows:

```sh
node dist/cli.js backfill-thumbs --limit 500
```

Off means *no image*. It is never a fallback to loading the image from the site
the link points at — that hands every viewer's IP to whoever hosts it, which on
a tiered instance counts the readers below you.

**Health** is `GET /health`. It answers without touching the database on
purpose — a health check that fails when Postgres is slow turns a degradation
into an outage.

**Nothing is indexable.** Every response carries `X-Robots-Tag: noindex`, and
`/l/:public_id` returns the same neutral card for every URL, always. That route
is fetched by Discord, Slack and crawlers with no credentials; returning a real
title would make it an oracle for gated content readable by anyone who pastes a
link into a chat window.

**The link fetcher is guarded.** It refuses private and link-local addresses,
checks every redirect hop rather than only the first, caps the response size
against what actually arrives rather than the declared `Content-Length`, and
never re-serves SVG. `ALLOW_PRIVATE_FETCH=true` disables the address check and
exists for local development; setting it in production turns the fetcher into a
server-side request forgery primitive. Residual risk, stated rather than
hidden: DNS rebinding between the check and the connection is not closed.

---

## Tests

```sh
npm test                                    # unit + the auth contract suite
TEST_DATABASE_URL='postgresql://…' npm test # adds the visibility suite
```

[`test/visibility.test.ts`](test/visibility.test.ts) is the one that matters and
it skips itself without a database, so **CI must set `TEST_DATABASE_URL`.**
Every other test checks a reimplementation of the ring rule. That one checks the
rule, because filtering happens in SQL and a test that does not reach SQL proves
nothing about what a viewer receives.

Use a throwaway database: the suite truncates every table.

---

## Environment reference

See [.env.example](.env.example). The ones that are easy to get wrong:

- **`WEB_ORIGIN`** — comma-separated list of origins allowed to send
  credentialed requests. Not the API's own origin. Get this wrong and the SPA
  gets CORS errors on every call.
- **`IP_SALT`** — salts the IP hashes behind anonymous rate limiting and
  recovery requests. Changing it resets every anonymous bucket. Keep it secret
  and keep it stable.
- **`SETUP_TOKEN`** — unlocks `/setup` and nothing else. Inert once the instance
  is configured.
- **`TRUST_PROXY`** — true by default. Correct behind a proxy, spoofable
  without one.
