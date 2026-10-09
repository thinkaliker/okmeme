# api

rest over json, described by an openapi 3.1 document that is the source of truth for clients. implemented in [api/](api/); see [api/README.md](api/README.md) for deployment.

**field names are camelCase.** `publicId`, `nextCursor`, `thumbKey`, `viewerVote`. path segments and query parameters keep the snake_case spelling used below. this is a naming convention and nothing more — the rules further down are the part that matters — but it has to be stated once so both sides agree.

rest rather than trpc or graphql on purpose. trpc's ergonomics assume a single typescript client and would quietly contradict the requirement that other frontends can use this api. graphql's field-level flexibility is the wrong shape when every field's visibility depends on the caller's tier — it multiplies the surface where a leak can happen.

## authentication

two credential types, both resolving to a user and therefore to a tier:

- **session cookie** — opaque, httponly, samesite, issued by the web frontend's login flow
- **bearer token** — `Authorization: Bearer okm_…`, minted per user, carrying exactly that user's tier

anonymous requests are valid and resolve to tier 0. line-item correction to the original design: the api **authorizes** every request, but does not authenticate every request — public read is a real, supported path.

there is no email in any flow. signup consumes an invite, and account recovery spends a one-time code issued at signup. nothing sends mail.

## rules every endpoint follows

1. **filter in sql, never in application code.** a post-filter that runs after pagination yields short pages, and short pages count hidden rows.
2. **never emit an internal id.** opaque `public_id` only.
3. **never emit a total.** no `count`, no `total`, no page numbers, no absolute ranks — in search results as much as in feeds.
4. **cursor pagination only.** `?cursor=&limit=`, response `{ items, nextCursor }`, filtered in sql before the slice so a page is short only at the true end of the list. `limit` caps at 50; the server fetches `limit + 1` rows and the extra one is how "there is more" is answered without counting anything.
5. **resolve identity server-side.** above-tier authors return `{ kind: "tier", label: "full" }` with no id field present at all — not present-and-null.
6. **moderation is anonymous.** any endpoint exposing a removal, edit, or sanction returns `"moderator"` and never a tier or an actor.

## rate limits

flat across tiers, per user and per token; anonymous requests limited per ip.

| bucket | limit |
| --- | --- |
| reads (authenticated) | 600 / min |
| reads (anonymous) | 120 / min |
| writes — submit, edit, comment | 60 / hr |
| votes | 300 / hr |
| reports | 20 / hr |
| submit-time url fetch | 20 / hr |
| invite issuance | 20 / hr |
| recovery requests | 3 / hr per ip |
| setup page | 20 / hr per ip |

the setup bucket is not part of the original table. it exists because `/setup` was otherwise spending the recovery allowance for everyone behind one ip, and three page loads is not a plausible budget for a form with four fields on it.

flat values mean a new limited account has the same throughput as an admin. that is acceptable **only because signup is invite-only, admin-issued, and single-use** — there is no drive-by account farming for a tiered limiter to slow down. the growth control is the invite; do not treat these numbers as an anti-sockpuppet measure.

## surface

### feed and content

```http
GET    /feed?cursor=&limit=&category=&tag=&sort=
GET    /search?q=&cursor=&limit=&category=&tag=&bookmarked=
GET    /links/:public_id
GET    /links/:public_id/revisions      admin + owner
POST   /links
PATCH  /links/:public_id
DELETE /links/:public_id
POST   /links/:public_id/vote
DELETE /links/:public_id/vote
POST   /links/:public_id/bookmark
DELETE /links/:public_id/bookmark
POST   /links/preview          → canonicalize + visible-scope dedup check, pre-submit
```

`POST /links/preview` returns whether a *visible* duplicate exists. it must never consult content outside the caller's scope.

`GET /search` runs the feed's predicate plus a tsvector match. it returns no result count, because a count of matches is a count of rows — including the ones the caller can't see.

### taxonomy

```http
GET    /categories
POST   /categories             admin
GET    /tags                   approved, plus the caller's own pending proposals
POST   /tags                   staff+
GET    /tags/pending           staff+; 404 below that
POST   /tags/:slug/approve     staff+
DELETE /tags/:slug             staff+; rejects a pending proposal
```

`POST /links` accepts free-text tag names alongside slugs. the server slugifies them and decides what each becomes: an existing tag applied, or a proposal queued for staff. proposing a name someone else has already proposed joins that proposal and returns the same response as creating one — a different answer would say whether a stranger had proposed the word.

`GET /tags` never returns another user's pending proposal below staff, and no endpoint returns a count of the queue.

### self

```http
GET    /me
PATCH  /me                     show_nsfw, theme, display preferences
DELETE /me                     tombstone; see SCHEMA.md
GET    /me/bookmarks?cursor=
GET    /me/notifications?cursor=&unread=
POST   /me/notifications/read           mark all, or a list of ids
GET    /me/tokens
POST   /me/tokens
DELETE /me/tokens/:public_id
POST   /me/recovery-codes               regenerate; invalidates all prior codes
POST   /me/suspension/appeal            once per sanction; 409 if already filed
```

`GET /me` carries any active sanction: type, expiry, reason category, and note.

`GET /me/notifications` is the only channel that reaches a user about anything, since no mail is ever sent. payloads are subject to every rule in this document — a removal notification says `"moderator"` and nothing more.

`POST /me/suspension/appeal` is reachable by a `lockout` user. their credentials authenticate normally but yield a session authorised for exactly two things: reading the sanction and filing one appeal. refusing the login outright would leave them with no channel at all.

### auth

```http
POST   /auth/signup            requires a valid, unexpired, unconsumed invite code
POST   /auth/login             local provider
POST   /auth/logout
POST   /auth/recover           spend a one-time recovery code
POST   /auth/recovery-request  no codes left; reaches an admin out of band
POST   /auth/password          change it while signed in; revokes every other session
GET    /auth/callback          supabase provider
```

`POST /auth/recovery-request` returns an identical response for every input — *"if that account exists, an admin has been notified"* — in constant time, and writes a row only when the account is real. anything else makes it a username oracle.

both providers resolve through the same `identities` mapping and hit the same contract test suite. `POST /auth/signup` returns the ten recovery codes exactly once and never again.

### reports

```http
POST   /reports
```

single admin queue regardless of subject tier. the response never confirms anything about the subject beyond acceptance.

### admin

```http
GET    /admin/reports?cursor=
POST   /admin/reports/:id/resolve
GET    /admin/appeals?cursor=
POST   /admin/appeals/:id/resolve             outcome + optional constrained note
GET    /admin/recovery-requests?cursor=       oldest first; never auto-closed
POST   /admin/recovery-requests/:id/resolve
GET    /admin/users?cursor=&q=                 q matches usernames; admins see every tier
POST   /admin/users/:public_id/tier          promote / demote
POST   /admin/users/:public_id/suspend       types[], expires_at nullable, reason
POST   /admin/users/:public_id/unsuspend
POST   /admin/users/:public_id/reset         issue fresh recovery codes
GET    /admin/suspensions/indefinite         open-ended sanctions, oldest first
POST   /admin/links/:public_id/tier          moderator re-tier → pinned_tier
GET    /admin/invites
POST   /admin/invites
DELETE /admin/invites/:id                    revoke before consumption
GET    /admin/audit?cursor=                  admin + owner
GET    /admin/settings
PATCH  /admin/settings
```

### owner

```http
GET    /owner/owners
POST   /owner/owners                         add another owner
DELETE /owner/owners/:public_id              refused for the last remaining owner
PATCH  /owner/settings                       owner-writable keys, incl. invite_min_tier
```

`/admin/*` and `/owner/*` are gated by tier on the server. hiding the admin panel in the frontend is presentation, not authorization.

`PATCH /owner/settings` on `invite_min_tier` requires explicit confirmation and is always audited — lowering it below admin is a change to the security model, not a preference.

### setup

```http
GET    /setup?token=            one time, ever
POST   /setup                   creates owner + admin, returns both code sets
```

available only while `settings.setup_complete` is false and `SETUP_TOKEN` is set; 404s permanently afterwards, so a leaked token on a live instance is inert. creates **two** accounts — an owner cannot post and an admin is the only tier that issues invites, so an instance with just an owner can never gain a user. `okmeme init` is the equivalent for deployments that have a shell; vercel does not.

`GET /setup` also reports `blobStore: boolean` — whether one is configured at all — and `POST /setup` accepts an optional `thumbnails` boolean, defaulting to true. it is the only instance setting the bootstrap asks about, because it is the only one whose answer depends on something known at install time and nowhere else. a `true` against `BLOB_STORE=none` is recorded as false rather than refused: the server does not accept an answer it cannot honour.

### media and unfurls

```http
GET    /thumb/:key                       served from okmeme's origin
GET    /l/:public_id                     html, generic og card only
```

`/l/:public_id` returns the **same neutral card for every url**, always. it is fetched by discord, slack, and crawlers with no credentials, so returning real titles would make it an oracle for gated content readable by anyone who pastes a url into a chat window. nothing about okmeme is indexable, which is consistent with invite-only signup.

`/thumb/:key` re-fetches from the source url on a cache miss and stores the derivative. the fetch is always server-side; a viewer's browser never touches a third-party host.

with thumbnails off — `BLOB_STORE=none`, or `settings.thumbnails_enabled` false — `thumb_key` and `favicon_key` come back null on every link and `/thumb/:key` 404s for every key, identically to one that never existed. there is no field telling a client the instance has them disabled, and no url pointing anywhere else: a client that cannot resolve an image draws the host letter it already draws for a link whose target has no preview.

### health

```http
GET    /health
```

answers without touching the database, on purpose: a health check that fails
when postgres is slow turns a degradation into an outage.

## realtime

none. use SSE or short polling against this api. a provider-specific realtime channel would be a fourth thing to port and would carry visibility rules that live outside the sql predicate in [SCHEMA.md](SCHEMA.md).
