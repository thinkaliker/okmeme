# schema

postgres 15+, accessed through prisma. types below are indicative rather than exact ddl.

conventions:

- **`id`** is an internal `bigserial` and never leaves the database.
- **`public_id`** is an opaque random string and is the only identifier the api emits. sequential ids would let anyone enumerate content and count the gaps, which counts hidden posts.
- **`tier`** is a `smallint` ordinal, never an enum string. every visibility rule is `author.tier <= viewer.tier + 1`, and that only works on ordinals.
- timestamps are `timestamptz`.

## identity

**users** — accounts, tier, and lifecycle state.

| column | type | notes |
| --- | --- | --- |
| `id` | bigserial pk | |
| `public_id` | text unique | opaque |
| `username` | citext unique null | null once tombstoned |
| `tier` | smallint | 1–5; anonymous is the absence of a user |
| `state` | enum | `active` \| `deleted` — suspension lives in its own table |
| `show_nsfw` | boolean | default false |
| `invited_by` | bigint fk users null | always an admin under current rules |
| `created_at` | timestamptz | |
| `deleted_at` | timestamptz null | |

tier 5 is a **set** — multiple owners are permitted. any owner may add or remove another; a check prevents removing the last one.

deletion tombstones in place: `username` and all pii null, `state='deleted'`, sessions, tokens and recovery codes revoked, identities deleted, and every link they authored gets `pinned_tier` set to its last effective tier so the dynamic join still resolves.

**identities** — the portability seam. never key anything on a provider's subject.

| column | type | notes |
| --- | --- | --- |
| `id` | bigserial pk | |
| `user_id` | bigint fk users | |
| `provider` | text | `local` \| `supabase` |
| `subject` | text | provider's own id |
| | | unique `(provider, subject)` |

**sessions** — `id`, `user_id`, `token_hash`, `expires_at`, `created_at`. opaque httponly cookies; store the hash, never the token.

**api_tokens** — `id`, `user_id`, `public_id`, `token_hash`, `name`, `last_used_at`, `created_at`, `revoked_at`. tokens carry exactly the issuing user's tier.

**recovery_codes** — `id`, `user_id`, `code_hash`, `created_at`, `used_at` null. ten issued at signup, displayed once, never recoverable afterwards. these replace email entirely: there is no verification mail and no reset link.

**recovery_requests** — `id`, `user_id`, `note`, `ip_hash`, `created_at`, `resolved_by` null, `resolved_at` null.

filed unauthenticated by someone who has burned or lost all ten codes. the endpoint returns an identical response for every input and **only writes a row when the named account actually exists** — writing rows for unknown usernames would turn the admin queue into a spam sink and the response timing into an enumeration oracle. an admin verifies identity out of band before issuing fresh codes.

a partial unique index on `(user_id) WHERE resolved_at IS NULL` permits one open request per account, so the queue cannot be flooded on anyone's behalf. requests never expire and are never auto-closed — the queue sorts oldest first, and nothing is quietly dismissed on a timer.

**invites** — `id`, `code_hash`, `issued_by` fk users, `issued_at`, `expires_at`, `consumed_by` fk users null, `consumed_at` null, `revoked_at` null. single-use, 14-day default expiry.

## content

**links** — the core content table.

| column | type | notes |
| --- | --- | --- |
| `id` | bigserial pk | |
| `public_id` | text unique | opaque |
| `kind` | enum | `link` \| `text` \| `media` |
| `url` | text null | null when `kind='text'` |
| `url_canonical` | text null | **indexed, not unique** — see below |
| `title` | text | |
| `body` | text null | text posts and expandos |
| `search_vec` | tsvector generated | title + body + tag names |
| `thumb_key` | text null | blob store key, never a remote url |
| `category_id` | bigint fk categories | exactly one |
| `author_id` | bigint fk users | |
| `author_tier_at_post` | smallint | audit only, never queried for visibility |
| `pinned_tier` | smallint null | set by moderator re-tier, or on author deletion |
| `is_nsfw` | boolean | |
| `created_at` / `edited_at` | timestamptz | |
| `removed_at` | timestamptz null | soft delete |
| `removed_reason` | text null | never shown with an actor |

`url_canonical` carries **no unique constraint**. dedup is scoped to what the submitter can see, so the same url legitimately exists at multiple tiers. uniqueness would silently enforce global dedup and reintroduce the submission oracle.

**link_revisions** — `id`, `link_id`, `seq`, `title`, `body`, `editor_id`, `created_at`.

one row per edit by anyone, including the author. readers see only an "edited" marker; the chain is readable by admins and owners. this closes the case where an author quietly rewrites a post after it has been voted on, which the audit log alone does not cover — the audit log only fires on edits of *someone else's* content.

**categories** — `id`, `slug` unique, `name`, `created_by`, `created_at`. admin-created.

**tags** — `id`, `slug` unique, `name`, `status` enum (`approved` \| `pending`), `created_by`, `created_at`. staff-created, or author-proposed and staff-approved.

a `pending` row is a proposal. it joins links through `link_tags` like any other tag, and the read path filters it: a pending tag is returned only to the author of the link carrying it and to staff and above. `created_by` is therefore the proposer, and because staff and above insert with `status='approved'` directly, every pending row belongs to a user its reviewer can already see. approving is a status flip; rejecting deletes the row and cascades through `link_tags`.

**link_tags** — `link_id`, `tag_id`, pk on both.

**votes** — `link_id`, `user_id`, `value` smallint, `created_at`, pk `(link_id, user_id)`.

**link_scores** — `link_id` pk, `score` int, `updated_at`. one true global score per link, identical for every viewer.

**bookmarks** — `user_id`, `link_id`, `created_at`, pk on both. private. read through the same visibility predicate as the feed, so a bookmarked post whose author is demoted drops out of the list with no tombstone and no notice — and reappears if that author is re-promoted. rows are never deleted by a visibility change; only the user removing the bookmark deletes one.

**notifications** — `id`, `user_id`, `kind`, `payload` jsonb, `created_at`, `read_at` null.

kinds: `sanction`, `content_removed`, `content_retiered`, `tier_changed`, `appeal_resolved`, `recovery_approved`. with no email this is the only channel that reaches a user, so it is infrastructure rather than polish. **payloads obey every visibility rule** — a removal notification says `"moderator"` exactly as the post does, and never names an actor or a tier.

nothing is ever pruned. the table doubles as a permanent per-user account history, which is worth more than the storage on a site where moderation is otherwise opaque. growth tracks moderation volume rather than traffic, so it is slow.

**comments** *(reserved — no api, no ui)*

`id`, `public_id`, `link_id`, `parent_id` fk comments null, `author_id`, `author_tier_at_post`, `pinned_tier` null, `body`, `created_at`, `edited_at`, `removed_at`. the invisible-parent rule in [VISIBILITY.md](VISIBILITY.md) means subtrees must be truncatable server-side — either a materialised path or a recursive walk that stops at the first invisible ancestor.

## moderation

**reports** — `id`, `subject_type` (`link`\|`comment`\|`user`), `subject_id`, `reporter_id`, `reason`, `note`, `created_at`, `resolved_by` null, `resolved_at` null, `resolution` null. single admin queue; `reporter_id` is never exposed to the reported party.

**suspensions** — active and historical sanctions.

| column | type | notes |
| --- | --- | --- |
| `id` | bigserial pk | |
| `user_id` | bigint fk users | |
| `types` | enum[] | any of `mute`, `submission_ban`, `lockout`, `content_hold` |
| `expires_at` | timestamptz null | **null means indefinite** |
| `reason_category` | enum | `spam` \| `abuse` \| `nsfw` \| `other` |
| `note` | text null | shown to the user — constrained, see below |
| `created_by` | bigint fk users | admin only |
| `created_at` | timestamptz | |
| `lifted_by` / `lifted_at` | | null while active |

a suspension is active when `lifted_at IS NULL AND (expires_at IS NULL OR expires_at > now())`. types are combinable. `content_hold` is the only type that touches visibility — it excludes the user's links from every feed for the duration, and is therefore the only one observable on the polling channel.

`note` is written by an admin who can see everything, shown to a user who cannot. it may never name a reporter or reference content above the user's tier. indefinite suspensions (`expires_at IS NULL`) surface in an admin review list sorted by age so they do not accumulate silently.

there is deliberately no `vote_manipulation` category. a reason code with no detection behind it invites false confidence that something is being watched; on an invite-only instance where every account traces back to an admin, vote rings are handled under `abuse`.

**appeals** — `id`, `suspension_id` **unique**, `user_id`, `body`, `created_at`, `resolved_by` null, `resolved_at` null, `outcome` enum null, `outcome_note` text null.

the unique constraint on `suspension_id` is the whole mechanism: one appeal per sanction, enforced by the database rather than by application logic. a `lockout` user can still authenticate, but into a session authorised for nothing except reading their sanction and filing this one row.

`outcome` is `upheld` \| `reduced` \| `overturned`. `outcome_note` is optional and carries exactly the same constraint as `suspensions.note` — written by an admin who sees everything, shown to a user who does not, and never naming a reporter or referencing content above their tier.

**audit_log** — `id`, `actor_id`, `action`, `subject_type`, `subject_id`, `before` jsonb, `after` jsonb, `created_at`.

append-only, enforced at the database role level rather than in application code — the application role gets `INSERT` and `SELECT` and no `UPDATE` or `DELETE`. readable by admin and owner only.

**settings** — `key` pk, `value` jsonb, `updated_by`, `updated_at`, plus a `min_writer_tier` column so a setting can require more than admin.

`setup_complete` is written once by whichever bootstrap path ran first and is never unset. both `/setup` and `okmeme init` check it and refuse; the web route 404s once it is true, so a leaked `SETUP_TOKEN` on a live instance is inert.

`thumbnails_enabled` switches media derivation off for an instance with nowhere to keep bytes. it is admin-writable and cosmetic: with it false nothing is fetched, nothing is stored, `/thumb/:key` 404s, and links render with the tinted host letter. `BLOB_STORE=none` forces it false regardless, so an admin cannot enable a feature the deployment cannot serve. it never causes a fallback to the source host — see [VISIBILITY.md](VISIBILITY.md).

`invite_min_tier` is the one setting that is **owner-writable only**. lowering it below admin converts the invite table into a cross-tier identity graph, is audited, and is irreversible in effect — raising it back does not unbuild what it created. see [VISIBILITY.md](VISIBILITY.md).

## the visibility predicate

every list query filters in sql. nothing is post-filtered in application code, because a post-filter that runs after pagination produces short pages, and short pages count hidden rows.

```sql
SELECT l.*, COALESCE(l.pinned_tier, u.tier) AS effective_tier
FROM links l
JOIN users u ON u.id = l.author_id
WHERE l.removed_at IS NULL
  AND COALESCE(l.pinned_tier, u.tier) <= :viewer_tier + 1
  AND (NOT l.is_nsfw OR (:viewer_tier >= 2 AND :viewer_show_nsfw))
  AND NOT EXISTS (
    SELECT 1 FROM suspensions s
    WHERE s.user_id = l.author_id
      AND 'content_hold' = ANY(s.types)
      AND s.lifted_at IS NULL
      AND (s.expires_at IS NULL OR s.expires_at > now())
  )
  AND (l.created_at, l.id) < (:cursor_ts, :cursor_id)
ORDER BY l.created_at DESC, l.id DESC
LIMIT :limit;
```

`effective_tier <= viewer_tier` means the row is rendered with a real username; `effective_tier = viewer_tier + 1` means it is rendered as a bare tier label with the author id omitted from the response entirely.

search adds `AND l.search_vec @@ websearch_to_tsquery(:q)` and orders by `ts_rank` — the predicate is otherwise identical, which is the point of keeping the index in the database.

## indexes

- `links (created_at DESC, id DESC)` — keyset feed pagination
- `links (category_id, created_at DESC)` — category feeds
- `links (url_canonical)` — dedup lookups
- `links USING GIN (search_vec)` — full-text search
- `link_tags (tag_id, link_id)` — tag filtering
- `votes (user_id)` — a user's own vote state
- `bookmarks (user_id, created_at DESC)`
- `notifications (user_id, created_at DESC)`, `notifications (user_id) WHERE read_at IS NULL` — partial, drives the unread badge
- `suspensions (user_id) WHERE lifted_at IS NULL` — partial, hit on every request
- `recovery_requests (user_id) WHERE resolved_at IS NULL` — partial **unique**, one open request per account
- `link_revisions (link_id, seq DESC)`
- `audit_log (created_at DESC)`, `audit_log (subject_type, subject_id)`

the feed's tier predicate depends on a joined column, so if it becomes a bottleneck the fix is a generated `effective_tier` column maintained by trigger on promotion and demotion — not a denormalised copy that can drift.
