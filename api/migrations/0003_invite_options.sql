-- Invites with a use limit and an optional expiry, and a record of who spent
-- each one.
--
-- Until now every invite was single-use and always expired. Both are now per
-- invite: `max_uses` NULL means unlimited and `expires_at` NULL means never.
-- The defaults are unchanged — one use, and the `invite_ttl_days` setting —
-- so an admin who touches nothing issues exactly what they issued before.
--
-- Additive, because migrations run before the new code deploys and the old code
-- has to keep working in between. `consumed_by` and `consumed_at` stay, unread
-- and unwritten from here on; `users.invite_id` replaces them, since one slot
-- cannot hold a multi-use invite's accounts.
--
-- `uses` is a counter, not a derived count, because signup claims a use with a
-- single conditional UPDATE. That is what stops two people racing for the last
-- use of a code from both getting in. It is never emitted by the API.

ALTER TABLE invites ALTER COLUMN expires_at DROP NOT NULL;

-- ADD COLUMN ... DEFAULT fills existing rows, so every invite issued before
-- this migration becomes max_uses = 1: exactly what it already was.
ALTER TABLE invites ADD COLUMN max_uses integer DEFAULT 1
  CHECK (max_uses IS NULL OR max_uses >= 1);
ALTER TABLE invites ADD COLUMN uses integer NOT NULL DEFAULT 0
  CHECK (uses >= 0);

ALTER TABLE users ADD COLUMN invite_id bigint REFERENCES invites(id);

UPDATE users u SET invite_id = i.id
  FROM invites i
 WHERE i.consumed_by = u.id;

UPDATE invites SET uses = 1 WHERE consumed_at IS NOT NULL;

ALTER TABLE invites ADD CONSTRAINT invites_uses_within_max
  CHECK (max_uses IS NULL OR uses <= max_uses);

CREATE INDEX users_invite_idx ON users (invite_id) WHERE invite_id IS NOT NULL;
