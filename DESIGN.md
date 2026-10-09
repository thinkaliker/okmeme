# okmeme design

okmeme is a linkdump built around a semi-anonymous tiered community. two things define it: the ring visibility model — who can see whom — and a frontend that has to make that model feel ordinary rather than confusing.

this file is the overview. the server is in [api/](api/) and the frontend in [web/](web/); [DEPLOY.md](DEPLOY.md) is the step-by-step runbook for both deployment shapes. detail lives in:

- [VISIBILITY.md](VISIBILITY.md) — the ring model, the exact rules, and the leaks it does and doesn't close
- [SCHEMA.md](SCHEMA.md) — tables and the visibility predicate in SQL
- [API.md](API.md) — surface, conventions, and the rules every endpoint must follow
- [GAPS.md](GAPS.md) — decided-but-unbuilt, accepted leaks, and what's still open

## stance

okmeme is deliberately undiscoverable. signup is invite-only, shared links unfurl as a generic card, and nothing is crawlable or indexable. there is no organic growth path — someone has to let you in.

these three decisions depend on each other. opening any one of them without revisiting the others weakens the whole model.

## infrastructure

the server is an adapter layer, not a passthrough. every backend service sits behind a port with at least two implementations, so a self-hosted instance is a change of environment variables rather than a fork.

| port | implementations | config |
| --- | --- | --- |
| `AuthProvider` | `local` (argon2id + opaque session cookies), `supabase` | `AUTH_PROVIDER` |
| `DataStore` | postgres 15+ via prisma | `DATABASE_URL` |
| `BlobStore` | `local-fs`, `s3`, `supabase-storage` | `BLOB_STORE` |

both auth implementations are built from the start and both must pass the same contract test suite in CI. an abstraction with one implementation is a guess.

**there is no email provider.** signup is invite-only and the invite is the vouching, so there is nothing to verify. the local provider issues one-time recovery codes at signup and password reset spends one. a self-hoster needs a database and nothing else — no smtp, no deliverability, no bounce handling.

a user who burns or loses all ten codes files an unauthenticated recovery request, which lands in the admin queue for out-of-band verification. that endpoint returns an identical response whether or not the account exists, and only writes a row when it does — otherwise it is a username oracle and a spam sink.

because there is no email, **in-app notification is the only channel that exists**. that raises its status from a nicety to infrastructure: sanctions, moderation on your own content, tier changes, appeal outcomes, and approved recovery requests all have to land somewhere the user will see them.

**bootstrapping needs two accounts, not one.** an owner cannot post and an admin is the only tier that issues invites, so an instance with only an owner can never gain a single user. install therefore creates both at once.

there are two paths because there are two deployment shapes. a `SETUP_TOKEN` environment variable unlocks a one-time `/setup` page that creates both accounts and displays both sets of recovery codes — this is the only option on vercel, which gives you no shell. `okmeme init` does the same thing for docker and bare-metal. both are guarded by `settings.setup_complete`, and once it is set neither path exists again.

**the blob store is a cache, not a store of record.** thumbnails are derived from their source urls and re-fetched on miss, so a database-only restore is valid and complete. backup is `pg_dump` plus an optional blob sync, documented as a runbook rather than built as tooling.

the one rule that makes this work: **the provider's user id is never okmeme's user id.** an `identities` table maps `(provider, subject) → user_id`. without it you cannot migrate providers, cannot run two at once, and cannot let a user change how they log in.

there is no realtime. use SSE or polling from the okmeme api so there is nothing provider-specific to port.

## frontend

vite + react + typescript, shadcn/ui on tailwind, deployed as a static SPA against a separate api. typescript is not optional here — the entire permission model is integer tier comparisons, and mixing up `viewerTier` and `authorTier` in plain javascript is a silent privacy bug rather than a crash.

replacing material-ui removes the `classes` prop threaded through every component today, including down into `ReportPanel`. that is a rewrite of the component layer, not a dependency swap.

the design should stay simple: a list of links, expandos where they earn their place, mobile-first, light and dark modes driven by css variables with `prefers-color-scheme` as the default and an explicit override persisted per user.

on slow connections: route-level code splitting, cursor pagination, thumbnails served from okmeme's own origin at display size, and no barrel imports.

all user-visible text resolves from string keys, with only an english catalogue shipping for now. this is mostly cheap insurance, but it matters specifically for **tier labels**: `[full]` is a security boundary rendered as a word, so it must come from a fixed key chosen by the server and never be concatenated, interpolated, or assembled client-side. a label that can be constructed can be constructed wrongly.

notifications are an in-app inbox with an unread count, not a banner. their contents obey the same visibility rules as everything else — a removal notice says *"moderator"* in a notification exactly as it does on the post. they are never pruned, which makes the inbox a permanent account history: on a site where moderation is otherwise deliberately opaque, being able to scroll back through everything that has happened to your own account is worth the storage.

accessibility is a requirement, not a later pass. the current card nests an `<a>` inside a clickable card surface, which is broken for keyboard and screen readers; the rewrite fixes it. expandos need real `aria-expanded` and focus handling.

settings, an admin panel, and per-link editing all follow the same permission rules as everything else — see [VISIBILITY.md](VISIBILITY.md).

comments are provisioned but not built: the schema and the visibility rules are designed, nothing is shipped. everything else — signup, recovery, the one-time setup page, api tokens, the admin queues and the owner surface — is built against real endpoints. see [GAPS.md](GAPS.md).

## users

five ordinals. `public` is a *state* — not logged in — rather than a tier anyone occupies.

| ordinal | tier | notes |
| --- | --- | --- |
| 0 | *(anonymous)* | read-only, not an account |
| 1 | limited | limited post/comment/vote, bookmarks, no nsfw |
| 2 | full | full post/comment/vote, may post nsfw, edits own titles |
| 3 | staff | edits limited/full content, promotes up to full, creates tags |
| 4 | admin | edits staff and below, promotes up to admin, creates categories, issues invites, reviews all reports |
| 5 | owner | recovery and system settings only — cannot post, comment, or vote |

admins cannot demote other admins. owner is a **set**, not a single account: any owner may add or remove another, and the last remaining owner cannot remove themselves. this means an instance survives one person disappearing without needing shell access, at the cost of a wider blast radius on the most privileged role.

promotion is manual and always granted from above. this is consistent with the visibility model: since lower tiers see nothing but a bare tier label, nobody can build reputation downward, so the only people who can assess you are the people who can already see you.

the full capability matrix and the visibility rules are in [VISIBILITY.md](VISIBILITY.md).

## links

links carry both **categories** and **tags**. categories are top-level divisions, created by admins, and a link has exactly one. tags are created by staff, applied by authors, and filter within a category or across the whole site.

authors below staff may **propose** a tag at submission. the proposal is applied to their own post immediately but renders only to them and to staff until it is approved — an unapproved word must not reach every reader on one person's say-so. staff and above create tags outright and never produce a proposal, so every pending tag traces back to someone its reviewer can already see. rejecting one deletes the word; the posts that carried it keep their other tags and simply stop showing that one.

a link is one of three kinds — `link`, `text`, or `media` — as a real discriminated union rather than a sentinel url.

**no user uploads.** on submission the server fetches the target's preview image once, resizes it, stores it in the blob store, and serves it from okmeme's own origin. hotlinking third-party images would leak every viewer's ip to whoever hosts them, which in a tiered system is an active attack: post an image on a box you control, read your own access log, and count the viewers below you.

thumbnails are **optional to run at all**. an instance with no blob store (`BLOB_STORE=none`) or with `thumbnails_enabled` off fetches nothing and stores nothing, and every link falls back to the tinted first letter of its host — which is what a link with no preview image already renders. the switch is chosen at install and is an ordinary admin setting afterwards, with `okmeme backfill-thumbs` to derive what was skipped. what "off" may never mean is *loading the image from the site the link points at*: the degraded state is fewer pictures, never someone else's pictures, because the reason for proxying was never bandwidth.

**nsfw is a boolean on the link**, not a tag or a category, because it is a permission boundary and has to be enforced in the query. tags are user-applied and categories are a topic axis; neither can carry that weight.

**dedup runs only against what the submitter can see.** canonicalize (lowercase host, drop `www`, strip `utm_*`/`fbclid`/`gclid`, sort query params, drop the fragment, follow redirects), then check for an existing visible entry. checking globally would confirm the existence of content the submitter is not allowed to know about, turning submission into an oracle. the cost is that higher tiers occasionally see the same url twice at different tiers — which is arguably correct, since those are different audiences.

votes are a single true global count, shown identically to everyone. see [GAPS.md](GAPS.md) for what that concedes.

search is postgres full-text over titles, bodies, and tag names, running through the same visibility predicate as the feed. keeping the index inside postgres means there is exactly one place the ring rules are implemented; an external engine would be a second copy of every title with its own chance of being wrong.

bookmarks are private and are filtered by that same predicate, so a bookmarked post whose author is demoted simply drops out of the list — and returns if that author is later re-promoted. the row itself is never deleted; deleting it would let one person's demotion permanently destroy someone else's saved items. nothing is retained past a visibility change and no notice is shown, because a "no longer available" tombstone would pinpoint the exact moment a specific author was demoted. search accepts a `bookmarked` filter running the same predicate.

authors may edit their own posts indefinitely, including titles, with no window and no lock. the public "edited" marker and the full revision chain are the entire deterrent against rewriting a title after it has collected votes — anyone can see it happened, and admins can see exactly what changed.

rate limits are flat across tiers rather than tier-scaled. this works because invite-only, admin-issued, single-use codes mean there is no drive-by account farming to throttle in the first place; the growth control is the invite, not the limiter. it should not be relied on as an anti-sockpuppet measure.

## moderation

all reports go to a single admin queue regardless of what was reported. the reporter's identity is never visible to the reported.

suspension is admin-only and comes in four types, combinable: **mute** (read-only), **submission ban** (may still vote, comment, and bookmark), **lockout** (sessions and tokens revoked, login refused), and **content hold** (existing posts hidden for the duration). the first three leave content in place and so cause no feed mutation; content hold is the only one that makes posts vanish in bulk, which is observable on the polling channel — use it deliberately.

suspensions may be indefinite. because open-ended sanctions accumulate silently, indefinite suspensions surface in an admin review list sorted by age.

a suspended user may appeal **once per sanction** — a single message into the admin queue, after which the form closes for that sanction regardless of outcome. one shot is what stops an appeal channel from being a mute with extra steps. a locked-out user still authenticates successfully, but into a session that can do nothing except read the sanction and file that one appeal; refusing the login outright would leave them no channel at all.

a suspended user is told the type, the expiry, and a reason drawn from a fixed category list plus an optional admin note. **that note is subject to the same visibility rules as everything else** — it may never name a reporter or reference content the user cannot see. it is written by someone who can see everything, for someone who cannot.

every moderation action renders to every viewer, at every tier, as a generic *"moderator"* — never a tier name, never an account. the real actor is recorded in the audit log and nowhere else. this is what keeps the +1 rule from being punched through by the removal notice on a post.

every promotion, demotion, re-tier, invite issuance, removal, and edit of someone else's content writes an append-only audit row. in a system where identity is deliberately obscured and admins can rewrite other people's titles, an unlogged admin edit is undetectable by design. the log is readable by admins and the owner, and is never updated or deleted.
