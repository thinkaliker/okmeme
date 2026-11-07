-- Posts stay at the tier they were posted at.
--
-- Until now a post followed its author: promote someone and their whole back
-- catalogue moved up with them, out of sight of the tier that used to read it;
-- demote them and it moved down, in front of people it was never written for.
-- Each move was also visible in bulk to anyone polling a feed — GAPS.md's
-- weakest point. From here on a post is pinned where it was posted, and only
-- its author (within their own tier) or an admin moves it.
--
-- Two columns carry that:
--
-- - `pinned_tier` — where the post lives. Already exists. New posts always set
--   it; existing posts are frozen at exactly where they are today, so nothing
--   anyone can see changes when this runs.
-- - `attribution_tier` — new. The tier the author is named at on this post: a
--   viewer at or above max(pinned_tier, attribution_tier) sees the name, anyone
--   else a label. Set to the author's tier when posting and never moved, so a
--   later promotion does not relabel old posts and give the promotion away.
--   Existing posts get the author's current tier, which is what attribution
--   already reads, so again nothing visible changes.
--
-- Additive: the old code never reads `attribution_tier`, and a post it writes
-- between this migration and the deploy has it null, which the new code reads as
-- the author's current tier — the old behaviour, for that handful of rows.
--
-- One-way in effect: once frozen, nothing records which posts were following
-- their author before. An admin can still unpin any single post.

ALTER TABLE links ADD COLUMN attribution_tier smallint
  CHECK (attribution_tier IS NULL OR attribution_tier BETWEEN 1 AND 5);

UPDATE links l
   SET attribution_tier = u.tier
  FROM users u
 WHERE u.id = l.author_id;

UPDATE links l
   SET pinned_tier = u.tier
  FROM users u
 WHERE u.id = l.author_id
   AND l.pinned_tier IS NULL;
