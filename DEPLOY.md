# Deploying okmeme

Three paths, pick one:

- **[Path A — Vercel](#path-a--vercel)**: two Vercel projects and a hosted
  Postgres. No server to maintain, no shell. ~45 minutes the first time.
- **[Path B — Docker Compose](#path-b--docker-compose)**: one box, one command.
  ~20 minutes.
- **[Path C — bare metal](#path-c--bare-metal)**: systemd, nginx or Caddy, and a
  Postgres you installed yourself. ~60 minutes.

All three end at the same place: an instance with one owner account, one admin
account, and an invite code you hand to your first user.

Read [Before you start](#before-you-start) regardless of which path you pick.
The two decisions in it are annoying to change later.

---

## Before you start

### What okmeme is made of

Two deployable things and one database.

| piece | what it is | where it goes |
| --- | --- | --- |
| `api/` | The server. Node, Hono, Prisma. | A Node runtime, or a Vercel function. |
| `web/` | The SPA. Vite + React, built to static files. | Any static host. |
| Postgres 15+ | Everything. Users, links, votes, the audit log. | Managed, or your own. |

There is a fourth optional piece — a **blob store** for thumbnails — but it is a
*cache*, not a store of record. Every thumbnail is recomputable from the link's
URL, so `pg_dump` is a complete backup and you can lose the blob store entirely
without losing data.

**There is no email provider, and there is nothing to configure for one.** No
SMTP, no deliverability, no bounce handling. Signup consumes an invite, and
account recovery spends a one-time code. That is the whole story.

### Decision 1: your domains

This is the one that bites people. The SPA and the API are separate origins, and
the session cookie has to cross between them.

**Strongly recommended — two subdomains of one parent:**

```text
okmeme.example.com       → the SPA
api.okmeme.example.com   → the API
```

The cookie is set on `.example.com` and both origins see it. This is boring and
it works in every browser.

**Possible but worse — two unrelated domains:**

```text
okmeme.app       → the SPA
okmeme-api.dev   → the API
```

Now the cookie is genuinely cross-site. It needs `Secure` and `SameSite=None`,
which the API sets for you when `COOKIE_SECURE=true` — but Safari's ITP and
Firefox's Total Cookie Protection will still refuse to store it in some
configurations, and you will spend an afternoon on it. Use two subdomains.

**Local development** sidesteps all of this: `localhost:5173` and
`localhost:8787` are same-site, so the cookie works with no configuration.

Write your two hostnames down now. You will type each of them into three
different boxes.

### Decision 2: your blob store

| you are on | pick | why |
| --- | --- | --- |
| Vercel | `s3` (Cloudflare R2 is cheapest) or `supabase-storage` | Vercel's filesystem is ephemeral and per-instance. |
| Your own box | `local-fs` | A directory. Mount a volume and forget about it. |
| Nowhere you want to pay for | `none` | No thumbnails at all. See below. |

`local-fs` on Vercel is not *wrong* — the store is a cache, so it degrades to
refetching every thumbnail on every cold start. It just means a steady outbound
request bill for no benefit.

**A free store, if you want one.** Thumbnails are 640px WebP, so they run 20–40
KB each, and the store is a cache you are allowed to lose. The free tiers are
therefore not a constraint you will feel:

| service | free allowance | notes |
| --- | --- | --- |
| **Cloudflare R2** | 10 GB stored, no egress fees ever | Speaks S3. `BLOB_STORE=s3`, region `auto`, path-style on. The recommendation. |
| Backblaze B2 | 10 GB stored, egress free to 3× stored per day | Also S3-compatible; same settings, different endpoint. |
| Supabase Storage | 1 GB stored, 5 GB egress | `BLOB_STORE=supabase-storage`. Sensible if you are already using Supabase for auth. |

10 GB is on the order of a quarter of a million thumbnails. If one is ever
evicted the next request refetches it, because a key is derived from the link
rather than random.

**Or run without them: `BLOB_STORE=none`.** Nothing is fetched, nothing is
stored, and every link renders with the tinted first letter of its host — the
same thing a link whose target has no preview image already shows. You can also
say no during setup with a blob store configured, which sets
`thumbnails_enabled` to false and leaves the store waiting.

> **What "off" must never mean.** It is not a fallback to loading the image from
> the site the link points at. Hotlinking hands every viewer's IP to whoever
> hosts the image, and on a tiered instance that is an attack rather than an
> annoyance: post an image on a box you control, read your own access log, and
> count the readers below you. The degraded state is *fewer pictures*, never
> *someone else's pictures*.

Turning them on later is [Settings → `thumbnails_enabled`](#changing-your-mind-about-thumbnails)
in the admin panel, plus one command for the posts made in the meantime.

### Things to generate now

Two random strings. Generate them and paste them somewhere you can find in ten
minutes:

```sh
# IP_SALT — salts the IP hashes behind anonymous rate limiting.
openssl rand -base64 32

# SETUP_TOKEN — unlocks the one-time bootstrap page. Vercel only.
openssl rand -hex 32
```

`IP_SALT` must stay **stable and secret** for the life of the instance. Changing
it resets every anonymous rate-limit bucket; leaking it makes the IP hashes
reversible by anyone who wants to guess an address.

### Tools on your machine

You need `node` (20 or newer), `npm`, and `git`. For Path A you also need
`psql` or any way to reach your database — actually no: migrations run through
`npm run migrate`, which only needs Node and the connection string. Nothing else.

---

## Path A — Vercel

Twelve steps. Vercel's UI moves buttons around between redesigns, so where the
exact label has drifted, the thing you are looking for is described as well as
named.

### A1. Create the database

Any Postgres 15+ works. Neon is used here because its free tier is generous and
its pooled connection string is one click.

1. Go to **<https://console.neon.tech>** and sign in.
2. Click **New Project** (top right, or the big card if this is your first).
3. Name it `okmeme`. Leave the Postgres version at the default as long as it is
   **15 or higher**. Pick a region near your Vercel region.
4. Click **Create project**.
5. You land on a **Connection Details** panel. Above the connection string there
   is a dropdown or toggle labelled **Pooled connection** (older UI:
   **Pooling: Enabled**). **Turn it on.**
6. Click the copy icon next to the connection string. It looks like:

   ```text
   postgresql://okmeme_owner:npg_xxxxx@ep-cool-name-123456-pooler.us-east-2.aws.neon.tech/okmeme?sslmode=require
   ```

   Note the `-pooler` in the hostname. If it is not there, you copied the direct
   string — go back and flip the toggle.

7. Paste it somewhere. This is your `DATABASE_URL`.

> **Why pooled matters.** A serverless function opens a database connection on
> every cold start and does not get to close it politely. Point okmeme at a
> direct connection and you will exhaust Postgres' connection limit under
> traffic that a single small server would not notice.

**Using Supabase instead?** Project → **Settings** → **Database** → **Connection
string** → choose the **Transaction pooler** tab (port `6543`), not Session and
not Direct. **Vercel Postgres?** Its integration sets `POSTGRES_URL` for you;
copy the value into `DATABASE_URL` as well, since okmeme reads that name.

### A2. Create the blob store

Skip if you chose `supabase-storage` (in which case you need your Supabase URL,
service role key, and a **private** bucket named `okmeme`).

Cloudflare R2, because it has no egress fees and speaks S3:

1. Go to **<https://dash.cloudflare.com>** → **R2 Object Storage** in the left
   sidebar.
2. Click **Create bucket**. Name it `okmeme-thumbs`. Location: **Automatic**.
   Click **Create bucket**.
3. **Leave it private.** Do not enable a public r2.dev URL. Thumbnails are
   served through okmeme's own `/thumb/:key` route — a viewer's browser must
   never resolve a foreign host, which is the same rule that rules out
   hotlinking the original image in the first place.
4. Go back to the R2 overview page. In the right sidebar click **Manage R2 API
   Tokens** (older UI: **Manage API Tokens**).
5. Click **Create API Token**.
6. Name it `okmeme-api`. Permissions: **Object Read & Write**. Under **Specify
   bucket(s)**, choose **Apply to specific buckets only** and select
   `okmeme-thumbs`.
7. Click **Create API Token**.
8. Copy all three values it shows you — **Access Key ID**, **Secret Access
   Key**, and the **S3 endpoint** (`https://<account-id>.r2.cloudflarestorage.com`).
   The secret is shown **once**.

### A3. Get the code onto GitHub

Vercel deploys from a git repository.

```sh
cd /path/to/okmeme
git add -A
git commit -m "okmeme: api and web"
gh repo create okmeme --private --source=. --push
```

Or create the repository through github.com and `git remote add origin … &&
git push -u origin main`.

### A4. Create the API project on Vercel

1. Go to **<https://vercel.com/dashboard>**.
2. Click **Add New…** (top right) → **Project**.
3. Under **Import Git Repository**, find `okmeme` and click **Import**. If it is
   not listed, click **Adjust GitHub App Permissions** and grant access to the
   repository.
4. You are now on the **Configure Project** screen. Three things to change:

   - **Project Name**: `okmeme-api`.
   - **Framework Preset**: **Other**. (`api/vercel.json` sets this too, but the
     import screen asks before it reads the file.)
   - **Root Directory**: click **Edit** next to it, select the **`api`** folder,
     click **Continue**.

5. Expand **Build and Output Settings**. Leave everything as it is — the
   `api/vercel.json` in the repository already sets the build command to
   `prisma generate`, and its rewrite sends every path to one function so Hono
   does the routing instead of the filesystem.
6. **Do not click Deploy yet.** Expand **Environment Variables** first and do
   step A5.

### A5. Set the API environment variables

Still on the Configure Project screen, in the **Environment Variables** section.
Add each of these with **Add**. (If you already deployed, they live under
**Settings** → **Environment Variables** instead — same list.)

| Key | Value |
| --- | --- |
| `DATABASE_URL` | the pooled string from A1 |
| `PUBLIC_URL` | `https://api.okmeme.example.com` |
| `WEB_ORIGIN` | `https://okmeme.example.com` |
| `AUTH_PROVIDER` | `local` |
| `BLOB_STORE` | `s3` |
| `COOKIE_SECURE` | `true` |
| `COOKIE_DOMAIN` | `.example.com` |
| `IP_SALT` | the random string you generated |
| `SETUP_TOKEN` | the other random string you generated |
| `NODE_ENV` | `production` |

Plus, for R2:

| Key | Value |
| --- | --- |
| `S3_BUCKET` | `okmeme-thumbs` |
| `S3_REGION` | `auto` |
| `S3_ENDPOINT` | `https://<account-id>.r2.cloudflarestorage.com` |
| `S3_ACCESS_KEY_ID` | from A2 |
| `S3_SECRET_ACCESS_KEY` | from A2 |
| `S3_FORCE_PATH_STYLE` | `true` |

Three of these are worth reading twice:

- **`WEB_ORIGIN` is the SPA's origin, not the API's.** It is the CORS allowlist.
  Get it wrong and every single request from the browser fails, with a message
  about `Access-Control-Allow-Origin` and nothing about what you actually did.
  Multiple origins are comma-separated, no spaces.
- **`COOKIE_DOMAIN` only makes sense if both hostnames share it.** With
  `okmeme.example.com` and `api.okmeme.example.com`, set `.example.com`. With
  two unrelated domains, **leave it empty** — setting it to one of them stops
  the cookie working entirely.
- **`SETUP_TOKEN` is temporary.** You delete it in step A12.

The full list of every variable okmeme reads is in
[api/.env.example](api/.env.example).

### A6. Apply the database schema

Migrations do **not** run when the API boots. A serverless function has no
single startup — it has one per cold start, and running migrations concurrently
from a dozen of them is a bad afternoon. So you run them once, from your
machine, before the first deploy.

```sh
cd okmeme/api
npm install
DATABASE_URL='postgresql://…the pooled string…' npm run migrate
```

Expected output:

```text
migrations: applied 0001_init.sql
```

If you see `already up to date`, the schema was already there — that is fine and
the command is safe to repeat.

> **`Can't reach database server`?** Your connection string needs
> `?sslmode=require` on the end. Neon includes it; some providers do not.

### A7. Deploy, and check it answers

Back in the browser, click **Deploy**. Watch the build log — it should run
`npm install` and then `prisma generate`, and finish in a minute or two.

When it finishes you get a URL like `okmeme-api-abc123.vercel.app`. Check it:

```sh
curl https://okmeme-api-abc123.vercel.app/health
```

Expected:

```json
{"ok":true}
```

Then check the database connection, which `/health` deliberately does *not*
test (a health check that fails when Postgres is slow turns a degradation into
an outage):

```sh
curl https://okmeme-api-abc123.vercel.app/feed
```

Expected:

```json
{"items":[],"nextCursor":null}
```

An empty feed is the correct answer for an instance with no content and an
anonymous caller. If you get a 500 instead, open **Deployments** → click the
deployment → **Runtime Logs**, and the error will be there. It is almost always
`DATABASE_URL`.

### A8. Create the web project

A second Vercel project, from the same repository.

1. **Add New…** → **Project** → import `okmeme` again. (Vercel will warn that
   the repository is already connected to a project. That is expected — click
   through it.)
2. **Project Name**: `okmeme-web`.
3. **Framework Preset**: **Vite**.
4. **Root Directory**: **Edit** → select **`web`** → **Continue**.
5. Leave the build settings alone. `web/vercel.json` already sets the preset,
   the build command and `dist` as the output directory.
6. Expand **Environment Variables** and add:

   | Key | Value |
   | --- | --- |
   | `VITE_API_MOCK` | `false` |
   | `VITE_API_URL` | `https://api.okmeme.example.com` |

   `VITE_API_MOCK=false` is not cosmetic. It removes the in-browser fake, its
   fixtures, and the dev tier switcher from the build output entirely. Leave it
   unset and you ship a frontend that talks to itself.

7. Click **Deploy**.

### A9. Check client-side routing

The SPA uses real URLs — `/l/abc123`, `/settings`, `/admin`. A static host 404s
on all of them when someone refreshes the page, because there is no
`/settings/index.html` to serve. [`web/vercel.json`](web/vercel.json) closes
that:

```json
{ "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }] }
```

Visit `https://<your-web-url>/settings` directly and refresh. You should get the
app, not a 404.

The rewrite is a catch-all and still does not swallow `/assets/…` or
`/favicon.ico`, because Vercel checks the filesystem before it consults
rewrites. A `redirects` entry would not behave that way, which is why this is
not one.

### A10. Attach your domains

Do this before bootstrapping, so the account you create is tied to the hostname
you will actually use.

**For the API project:**

1. Open the `okmeme-api` project → **Settings** → **Domains**.
2. Type `api.okmeme.example.com` in the box, click **Add**.
3. Vercel shows a DNS record to create — usually a `CNAME` pointing at
   `cname.vercel-dns.com`. Add it at your DNS provider.
4. Wait for the status to turn to **Valid Configuration**. Usually under a
   minute, occasionally an hour.

**For the web project:** the same, with `okmeme.example.com`.

**Then go back and fix the environment variables**, because they currently point
at the `.vercel.app` URLs or at hostnames that did not exist yet:

- `okmeme-api` → **Settings** → **Environment Variables** → confirm `PUBLIC_URL`
  is `https://api.okmeme.example.com` and `WEB_ORIGIN` is
  `https://okmeme.example.com`.
- `okmeme-web` → confirm `VITE_API_URL` is `https://api.okmeme.example.com`.

**Environment variable changes do not apply to a running deployment.** For each
project: **Deployments** → the top entry → the **⋯** menu on the right →
**Redeploy** → confirm.

### A11. Bootstrap the instance

Now the one-time part. Open in a browser:

```text
https://okmeme.example.com/setup?token=<your SETUP_TOKEN>
```

That is the **SPA's** `/setup` route. It calls the API's.

You get a form asking for four things: an owner username and password, and an
admin username and password.

**It creates two accounts, not one, and this is not padding.** An owner cannot
post, comment, or vote — it exists for recovery and system settings. An admin is
the only tier that issues invites. An instance with only an owner can therefore
never gain a single user.

Fill it in. Passwords are ten characters minimum. Click **Create both accounts**.

**The next screen shows twenty recovery codes — ten per account — and it is the
only time they will ever exist.** They are hashed at rest and nothing can print
them again. There is no email on this instance, so a lost set is recoverable
only by another admin, and if you lose both sets on a fresh instance you start
over.

Copy them into a password manager. Both sets. Now.

> **Getting a 404 on `/setup`?** That is the correct response for three
> different situations, deliberately: no `SETUP_TOKEN` is configured, the token
> is wrong, or the instance is already set up. They answer identically so a
> leaked token tells whoever has it nothing. Check that `SETUP_TOKEN` is set in
> the API project's environment **and that you redeployed after adding it**.

### A12. Remove the setup token

1. `okmeme-api` → **Settings** → **Environment Variables**.
2. Find `SETUP_TOKEN`, click the **⋯** at the end of its row, click **Remove**.
3. **Deployments** → top entry → **⋯** → **Redeploy**.

Strictly, this is belt and braces: `/setup` 404s permanently once
`settings.setup_complete` is true, so a leaked token on a live instance is
already inert. But there is no reason to keep a credential that can no longer do
anything.

### A13. Let your first person in

1. Go to `https://okmeme.example.com/login` and sign in as the **admin**
   account.
2. Click **Admin** in the left sidebar.
3. Click the **Invites** tab.
4. Optionally type a note in the box (it is for your own records — the invitee
   never sees it).
5. Click **Issue an invite**.
6. A code appears, like `okmi_7fk2m9qxwb3nrh4d`. **Copy it now** — it is hashed
   at rest and cannot be shown again. It is single-use and expires in 14 days,
   and you can revoke it until it is spent.
7. Send them `https://okmeme.example.com/signup` and the code.

You will also want at least one category before anyone can post — the submit
form requires one. There is no UI for creating categories yet; from the terminal:

```sh
curl -X POST https://api.okmeme.example.com/categories \
  -H 'Content-Type: application/json' \
  -b "okm_session=<your session cookie>" \
  -d '{"name":"General"}'
```

Get the cookie from your browser's devtools (**Application** → **Cookies**), or
mint an API token under **Settings** → **API tokens** and use
`-H "Authorization: Bearer okm_…"` instead.

**Done.** Skip to [After any install](#after-any-install).

---

## Path B — Docker Compose

One box, Docker installed, a domain pointed at it.

### B1. Get the code and configure it

```sh
git clone https://github.com/you/okmeme.git /srv/okmeme
cd /srv/okmeme/api
cp .env.example .env
```

Open `.env` and set, at minimum:

```sh
IP_SALT=<the random string you generated>
```

Everything else in the compose file's `environment:` block overrides `.env` for
the container, so for a Compose deployment you edit
[api/docker-compose.yml](api/docker-compose.yml) rather than `.env`:

```yaml
    environment:
      DATABASE_URL: postgresql://okmeme:okmeme@db:5432/okmeme
      PUBLIC_URL: https://api.okmeme.example.com
      WEB_ORIGIN: https://okmeme.example.com
      AUTH_PROVIDER: local
      BLOB_STORE: local-fs
      BLOB_DIR: /app/.blobs
      NODE_ENV: production
      COOKIE_SECURE: 'true'
      COOKIE_DOMAIN: .example.com
      IP_SALT: <the random string>
```

Change `POSTGRES_PASSWORD` on the `db` service too, and match it in
`DATABASE_URL`.

**Remove the `ports:` block from the `db` service** before this touches a
network you do not control. It publishes Postgres on `5432` for local
convenience and there is no reason for it to be reachable in production:

```yaml
  db:
    image: postgres:16-alpine
    # ports:            ← delete these two lines
    #   - '5432:5432'
```

### B2. Start it

```sh
cd /srv/okmeme/api
docker compose up -d --build
```

First build takes a few minutes. Then:

```sh
docker compose ps
```

Both services should show `running`, and `api` should show `(healthy)` after
about ten seconds.

### B3. Apply the schema

```sh
docker compose exec api node dist/cli.js migrate
```

Expected: `0001_init.sql`.

### B4. Bootstrap

```sh
docker compose exec -it api node dist/cli.js init
```

It prompts for four values — owner username, owner password, admin username,
admin password — with the passwords not echoed. Then it prints twenty recovery
codes.

**Copy them now.** Ten per account, shown once, hashed at rest, and with no
email on this instance a lost set is recoverable only by another admin.

To run it unattended instead (in a provisioning script), set the four values in
the environment and it will not prompt:

```sh
docker compose exec \
  -e OWNER_USERNAME=root -e OWNER_PASSWORD='…' \
  -e ADMIN_USERNAME=dee  -e ADMIN_PASSWORD='…' \
  api node dist/cli.js init
```

### B5. Build the frontend

The compose file runs the API only. The SPA is static files, built once:

```sh
cd /srv/okmeme/web
npm ci
VITE_API_MOCK=false VITE_API_URL=https://api.okmeme.example.com npm run build
```

Output lands in `/srv/okmeme/web/dist`. Serve that directory from your reverse
proxy — see [B6](#b6-put-a-reverse-proxy-in-front).

Rebuild it whenever you pull new code. It is a build-time constant, so changing
`VITE_API_URL` means rebuilding.

### B6. Put a reverse proxy in front

The API does not terminate TLS. Caddy is the least work because it gets
certificates on its own.

`/etc/caddy/Caddyfile`:

```caddyfile
okmeme.example.com {
    root * /srv/okmeme/web/dist
    encode gzip zstd
    # Client-side routing: any path that is not a real file is the SPA.
    try_files {path} /index.html
    file_server
}

api.okmeme.example.com {
    reverse_proxy 127.0.0.1:8787
}
```

```sh
sudo systemctl reload caddy
```

nginx equivalent, if you prefer:

```nginx
server {
    listen 443 ssl http2;
    server_name okmeme.example.com;
    root /srv/okmeme/web/dist;
    location / { try_files $uri /index.html; }
}

server {
    listen 443 ssl http2;
    server_name api.okmeme.example.com;
    location / {
        proxy_pass http://127.0.0.1:8787;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

`TRUST_PROXY` defaults to `true`, which is what you want here: the client IP
comes from `X-Forwarded-For` rather than the socket, and anonymous rate limiting
and recovery requests both hash it. Behind a proxy the socket address is the
proxy, so without this every anonymous visitor shares one bucket.

> **The other direction is worse.** If the API is ever reachable directly from
> the internet, `TRUST_PROXY=true` lets anyone set their own
> `X-Forwarded-For` and therefore their own rate-limit bucket. Bind it to
> `127.0.0.1` or set `TRUST_PROXY=false`.

### B7. First invite

Sign in at `https://okmeme.example.com/login` as the admin account, then follow
[A13](#a13-let-your-first-person-in) from step 2 — the UI is identical.

**Done.** Continue to [After any install](#after-any-install).

---

## Path C — bare metal

No Docker. Node and Postgres installed directly.

### C1. Install Postgres and create the database

```sh
sudo apt install postgresql postgresql-contrib   # Debian/Ubuntu
sudo -u postgres createuser --pwprompt okmeme
sudo -u postgres createdb --owner okmeme okmeme
```

okmeme needs the `citext` and `pgcrypto` extensions. Both ship with
`postgresql-contrib` and the migration creates them itself — you only need them
*available*.

Confirm the version is 15 or newer:

```sh
psql --version
```

### C2. Install Node and build

```sh
sudo useradd --system --home /srv/okmeme --shell /usr/sbin/nologin okmeme
sudo git clone https://github.com/you/okmeme.git /srv/okmeme
sudo chown -R okmeme:okmeme /srv/okmeme

cd /srv/okmeme/api
sudo -u okmeme npm ci --include=optional
sudo -u okmeme npm run build
```

`--include=optional` matters: `sharp` and `@aws-sdk/client-s3` are optional
dependencies. Without `sharp` the API still works, but thumbnails are stored at
their original size instead of resized WebP — larger, not broken.

### C3. Write the environment file

`/etc/okmeme/api.env`, readable only by root and the service user:

```sh
DATABASE_URL=postgresql://okmeme:PASSWORD@localhost:5432/okmeme
PUBLIC_URL=https://api.okmeme.example.com
WEB_ORIGIN=https://okmeme.example.com
AUTH_PROVIDER=local
BLOB_STORE=local-fs
BLOB_DIR=/srv/okmeme/api/.blobs
NODE_ENV=production
COOKIE_SECURE=true
COOKIE_DOMAIN=.example.com
TRUST_PROXY=true
IP_SALT=<the random string you generated>
PORT=8787
```

```sh
sudo chmod 640 /etc/okmeme/api.env
sudo chown root:okmeme /etc/okmeme/api.env
```

### C4. Apply the schema

```sh
cd /srv/okmeme/api
sudo -u okmeme env $(grep -v '^#' /etc/okmeme/api.env | xargs) node dist/cli.js migrate
```

### C5. Bootstrap

```sh
cd /srv/okmeme/api
sudo -u okmeme env $(grep -v '^#' /etc/okmeme/api.env | xargs) node dist/cli.js init
```

Same prompts, same twenty recovery codes, same warning: copy them now.

### C6. The systemd unit

`/etc/systemd/system/okmeme-api.service`:

```ini
[Unit]
Description=okmeme api
After=network.target postgresql.service
Requires=postgresql.service

[Service]
Type=simple
User=okmeme
WorkingDirectory=/srv/okmeme/api
EnvironmentFile=/etc/okmeme/api.env
ExecStart=/usr/bin/node dist/server.js
Restart=on-failure
RestartSec=5

NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/srv/okmeme/api/.blobs

[Install]
WantedBy=multi-user.target
```

```sh
sudo systemctl daemon-reload
sudo systemctl enable --now okmeme-api
sudo systemctl status okmeme-api
curl http://127.0.0.1:8787/health
```

### C7. Frontend and proxy

Identical to [B5](#b5-build-the-frontend) and
[B6](#b6-put-a-reverse-proxy-in-front).

### C8. Lock down the audit log

Do this on any self-hosted install. It is the one grant that matters.

`audit_log` is append-only. A database trigger enforces it and travels with the
schema, but the trigger is the second line of defence. The first is the grant:

```sql
-- psql as a superuser, after migrating
CREATE ROLE okmeme_app LOGIN PASSWORD 'a-different-password';
GRANT USAGE ON SCHEMA public TO okmeme_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO okmeme_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO okmeme_app;

-- the exception
REVOKE UPDATE, DELETE ON audit_log FROM okmeme_app;
```

Then point `DATABASE_URL` at `okmeme_app` and keep the owning role for
migrations only.

Why bother: in a system where identity is deliberately obscured and admins can
rewrite other people's titles, an **unlogged admin edit is undetectable by
design**. The audit log is the only thing standing in for that, so it should not
be writable by the process that would want to cover its tracks.

**Done.** Continue below.

---

## After any install

### Verify the thing actually works

Six checks, in order. Each one exercises a rule that is easy to break with a
misconfiguration.

```sh
API=https://api.okmeme.example.com

# 1. It is alive.
curl -s $API/health
# {"ok":true}

# 2. It can reach Postgres, and anonymous reads work.
curl -s $API/feed
# {"items":[],"nextCursor":null}

# 3. CORS allows the SPA.
curl -s -I $API/feed -H "Origin: https://okmeme.example.com" | grep -i allow-origin
# access-control-allow-origin: https://okmeme.example.com

# 4. CORS refuses everyone else.
curl -s -I $API/feed -H "Origin: https://evil.example" | grep -ci allow-origin
# 0

# 5. Setup is closed forever.
curl -s -o /dev/null -w '%{http_code}\n' "$API/setup?token=anything"
# 404

# 6. Nothing is indexable, and link previews say nothing.
curl -s $API/l/anything | grep 'og:description'
# <meta property="og:description" content="A link on okmeme. Sign in to view it.">
```

Check 6 is worth understanding rather than just passing. `/l/:id` returns the
**same neutral card for every URL, always**. It is fetched by Discord, Slack and
crawlers with no credentials — returning a real title would make it an oracle
for gated content, readable by anyone who pastes a link into a chat window.

Then, in a browser: sign in, and confirm you stay signed in after a refresh. If
you do not, the cookie is not being stored — see
[Troubleshooting](#troubleshooting).

### Back it up

Backup is `pg_dump` and nothing else:

```sh
pg_dump --format=custom --file=okmeme-$(date +%F).dump "$DATABASE_URL"
```

Put that in cron. Keep the dumps somewhere that is not the same machine.

**The blob store is optional to back up.** A restored instance with an empty
blob store serves pages with missing thumbnails and refetches each one on first
request, because `/thumb/:key` resolves the key back to a link, the link back to
its URL, and the URL back to the image. Sync it if you want to avoid the
refetch; do not treat it as data.

Restoring:

```sh
createdb okmeme_restored
pg_restore --dbname=okmeme_restored okmeme-2026-07-25.dump
DATABASE_URL='…okmeme_restored' npm run migrate   # no-op if the dump is current
DATABASE_URL='…okmeme_restored' npm run start
```

> **This has never been exercised.** [GAPS.md](GAPS.md) is explicit about it:
> restore is a documented plan, not a tested capability. If you are running this
> for real, do a restore drill into a scratch database before you need one.

### Upgrading

**Vercel:** push to `main`. Both projects redeploy. If the release includes a
migration, run it from your machine **before** pushing:

```sh
cd api && DATABASE_URL='…' npm run migrate
```

**Docker:**

```sh
cd /srv/okmeme
git pull
cd api
docker compose up -d --build
docker compose exec api node dist/cli.js migrate
cd ../web && npm ci && VITE_API_MOCK=false VITE_API_URL=https://api.okmeme.example.com npm run build
```

**Bare metal:**

```sh
cd /srv/okmeme && sudo -u okmeme git pull
cd api && sudo -u okmeme npm ci --include=optional && sudo -u okmeme npm run build
sudo -u okmeme env $(grep -v '^#' /etc/okmeme/api.env | xargs) node dist/cli.js migrate
sudo systemctl restart okmeme-api
cd ../web && sudo -u okmeme npm ci
sudo -u okmeme env VITE_API_MOCK=false VITE_API_URL=https://api.okmeme.example.com npm run build
```

Migrations are additive and applied once each, tracked in a `_migrations` table.
Running `migrate` when there is nothing to do prints `already up to date`.

### Changing your mind about thumbnails

Whichever way you answered at setup, it is an ordinary instance setting
afterwards.

**To turn them on**, first make sure there is somewhere to put them —
`BLOB_STORE` must be something other than `none`, which means a redeploy if you
are changing it. Then sign in as an admin, go to **Admin → Settings**, set
`thumbnails_enabled` to `true`, and save.

New submissions start fetching immediately. Posts made while it was off keep an
empty thumbnail, because the key is written at submission and nothing goes back
over old rows on its own. One command does that:

```sh
node dist/cli.js backfill-thumbs            # up to 500 posts
node dist/cli.js backfill-thumbs --limit 50 # or fewer, to try it first
```

It walks posts that have a URL and no thumbnail, oldest work last, and skips
anything it cannot reach. Safe to run twice — the query only ever picks up what
is still missing — and safe to interrupt. There is no equivalent on Vercel,
which gives you no shell; run it from any machine that can reach the database
with the same `DATABASE_URL` and blob store credentials in its environment.

**To turn them off**, set `thumbnails_enabled` to `false`. Fetching stops at the
next submission. Images already in the store stay there and stop being served —
delete them at the provider if you want the space back, and note that the keys
in `links.thumb_key` remain, so turning it back on restores those posts with no
backfill needed.

### Housekeeping

Rate limits are fixed windows in a `rate_limits` table, because a serverless
deployment shares no memory between invocations. Stale rows are harmless, but
you can prune them:

```sh
node dist/cli.js prune-rate-limits
```

Weekly in cron is plenty. Nothing breaks if you never run it.

Two things nobody monitors yet, both recorded in [GAPS.md](GAPS.md): thumbnail
storage growth, and the `notifications` table, which is **never pruned by
design** — the inbox doubles as a permanent per-user account history. Growth
tracks moderation volume rather than traffic, so it is slow, but it is not zero.

---

## Troubleshooting

### Every request from the browser fails with a CORS error

`WEB_ORIGIN` on the API does not exactly match the origin the browser is
sending. It is an exact string match: scheme, host, and port, with no trailing
slash.

```text
✅ WEB_ORIGIN=https://okmeme.example.com
❌ WEB_ORIGIN=https://okmeme.example.com/
❌ WEB_ORIGIN=okmeme.example.com
❌ WEB_ORIGIN=https://api.okmeme.example.com   ← that is the API, not the SPA
```

Confirm what the server actually thinks:

```sh
curl -s -I https://api.okmeme.example.com/feed \
  -H "Origin: https://okmeme.example.com" | grep -i access-control
```

No `access-control-allow-origin` in the response means the origin was rejected.
On Vercel, remember to **redeploy** after changing the variable.

### Login appears to work, but I am signed out on refresh

The session cookie is not being stored. In order of likelihood:

1. **`COOKIE_SECURE` is `false` in production.** A cross-site cookie must be
   `Secure`. Set it to `true`.
2. **`COOKIE_DOMAIN` is wrong.** It must be a parent of *both* hostnames
   (`.example.com`), or empty. Setting it to one specific host breaks the other.
3. **Your two hostnames share no parent domain.** This is Decision 1 coming
   back. Move the API to a subdomain of the SPA's domain.
4. **A browser extension or strict privacy setting.** Test in a private window
   with extensions off before rewriting any config.

Check what the server sent:

```sh
curl -s -i -X POST https://api.okmeme.example.com/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"you","password":"…"}' | grep -i set-cookie
```

You want `HttpOnly`, `Secure`, `SameSite=None`, and the right `Domain`.

### `/setup` returns 404

Three causes, one response, on purpose — a leaked token must not be able to tell
whether an instance is bootstrappable:

1. `SETUP_TOKEN` is not set in the API's environment.
2. The token in the URL does not match.
3. The instance is already set up. This is permanent.

For (1), remember Vercel needs a redeploy after adding the variable. For (3),
there is no undo — you are past bootstrap, so sign in with the accounts you
created, or restore from a backup.

### The setup page created accounts but I closed the recovery codes

They are gone. They are hashed at rest and nothing can print them again.

If you still have a session or a password for either account:
**Settings** → **Generate new codes**. That invalidates the old set and shows a
new one.

If you have lost both accounts entirely on a fresh instance, drop the database
and start over. On an instance with content, restore from a backup taken before
setup, or issue yourself codes directly against the database.

### 404 on every page except the home page

The SPA rewrite is missing. On Vercel that means `web/vercel.json` did not make
it into the deployment — see [A9](#a9-check-client-side-routing). Behind a
reverse proxy it is the `try_files` line in
[B6](#b6-put-a-reverse-proxy-in-front).

### Thumbnails never appear

In order:

1. **They are switched off.** Check `BLOB_STORE` is not `none`, and
   `thumbnails_enabled` under **Admin → Settings** is `true`. Either one off
   means off. See [Changing your mind about
   thumbnails](#changing-your-mind-about-thumbnails).
2. **`sharp` is not installed.** Not fatal — images are stored unresized. Check
   with `npm ls sharp`; reinstall with `npm ci --include=optional`.
3. **Blob store credentials are wrong.** Failures are swallowed on purpose,
   because a link with no preview is an ordinary link and a stranger's slow
   server should not block a submission. Look for errors in the API's logs at
   submission time.
4. **The target site has no `og:image`.** okmeme does not guess. It also never
   falls back to `https://<host>/favicon.ico` — a 16px image is enough to log a
   viewer, and a site that can count its referrers can count the readers of a
   tier it cannot see.

If they only fail on *old* posts, nothing is broken: a key is written at
submission, so posts made while thumbnails were off need `backfill-thumbs`.

### Postgres connection errors under load on Vercel

You are on a direct connection string, not a pooled one. Go back to
[A1](#a1-create-the-database) step 5.

### `error: type "citext" does not exist`

`postgresql-contrib` is not installed, or your managed provider does not allow
extensions. okmeme needs `citext` and `pgcrypto`.

---

## Reference

- [api/.env.example](api/.env.example) — every variable okmeme reads, annotated
- [api/README.md](api/README.md) — local development, the port abstractions, tests
- [web/README.md](web/README.md) — the SPA, and running it with no server at all
- [DESIGN.md](DESIGN.md) — why the infrastructure is shaped like this
- [GAPS.md](GAPS.md) — what is untested, unbuilt, and knowingly accepted
