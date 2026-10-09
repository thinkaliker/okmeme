# gaps

three lists: leaks accepted on purpose, decided-but-unbuilt, and still open.

## accepted leaks

these are known, deliberate, and should not be rediscovered as bugs.

**vote counts are globally true.** a limited user seeing a post at 14 points, in a tier where only a handful of accounts are visible, can infer that users exist above them and roughly how many. accepted in exchange for one score per post, one cache entry, and one consistent ranking.

**polling reveals tier changes.** post visibility follows the author's current tier, and the api is open to per-user tokens. a client polling the feed on a timer sees batches of posts appear or vanish at once, and each batch is someone being promoted, demoted, or placed under a content hold. the payload never leaks — the timing does.

this is the weakest point in the model and it is accepted knowingly. rate limits are the only mitigation and they are flat rather than tier-scaled, so they are a weak one. two fixes were considered and declined: jittered batching of tier changes, which costs the immediacy of promotion on an instance where that is a social moment; and tightening token reads to 60/min, which would collapse the channel's resolution from seconds to hours for one line of config. **the second is cheap and remains available** if the instance ever grows past the point where this matters.

**promotion is a retroactive reveal.** newly promoted users see the real authorship of everything at their new tier, including years-old posts. intentional.

**demotion does not un-reveal.** a demoted user keeps every identity they learned. unfixable, and the design does not pretend otherwise.

**admins are self-policing.** all reports, suspensions, appeals, and recovery requests are admin-only, including reports about admins. the only external checks are the audit log, the revision history, and the owner set.

**content hold is observable.** three of the four suspension types leave content in place and are invisible from outside. `content_hold` makes a user's posts vanish in bulk, which is exactly the signal described above. it is the correct tool sometimes; it is not a quiet one.

**titles can be rewritten after voting.** authors may edit indefinitely, with no window and no lock. the public "edited" marker and the full revision chain are the entire deterrent — visible to anyone, auditable by admins, but preventing nothing.

## decided, not built

**comments.** schema and visibility rules are fixed — see [VISIBILITY.md](VISIBILITY.md) for the invisible-parent rule and [SCHEMA.md](SCHEMA.md) for the reserved table. no api, no endpoints, no ui. the rule is settled now because it constrains the shape of the table, not because comments are close.

**tier-change jitter.** designed, declined, no setting reserved. additive if it is ever wanted.

**staff moderation is proactive only.** staff can edit and remove limited and full content, but cannot see the report queue and cannot suspend anyone. they can delete a bad post but not stop the person reposting it. this makes admins the bottleneck for every sanction. revisit if report volume grows.

**i18n beyond english.** all user-visible text resolves from string keys and only `en` ships. adding a language is adding a catalogue file; the constraint that matters is already enforced — tier labels come from fixed server-chosen keys and are never assembled client-side.

## still open

every design question raised so far has been answered. what is left is work that cannot be closed on paper.

**restore has never been exercised.** backup is a documented `pg_dump` runbook in [api/README.md](api/README.md), and thumbnail regeneration is built: `/thumb/:key` resolves the key back to a link, the link back to its url, and the url back to the image, so a database-only restore is complete rather than merely valid.

it is still untested. the ci job described here — restore a dump into a scratch database, start the api against it, assert that a page with missing thumbnails renders and that the derivatives are refetched on demand — does not exist. **there is now an api to boot, so the excuse is gone.** until that job exists and passes, restore is a plan rather than a capability, and it is the first thing to build next.

**nothing monitors thumbnail storage.** growth is bounded by live link count and the arithmetic is documented, but no alert exists. the same is true of the notifications table, which is never pruned by design.

**both bootstrap paths need testing together.** `/setup` and `okmeme init` write the same two accounts and both call the same `bootstrap()`, which claims the slot with `SELECT ... FOR UPDATE` on the `setup_complete` row inside a transaction — so a second caller blocks, then finds the flag set and is refused. the guard is in a transaction as required. **it has no test.** a race between the two, or either running twice, would still be a very bad day, and nothing currently proves it cannot happen.

**nothing exercises the supabase provider against a real project.** the contract suite runs it against an in-memory gotrue double, which proves the adapter's shape and not its assumptions about gotrue. the synthetic-email mapping in particular is the kind of thing that works until a version bump.

**dns rebinding in the link fetcher is open.** the fetcher resolves a hostname, rejects private addresses, and then hands the url to `fetch`, which resolves it again. closing the window needs an agent that pins the address it checked. worth doing on an instance with an interesting private network; not done.
