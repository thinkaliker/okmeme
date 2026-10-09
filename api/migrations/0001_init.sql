-- okmeme initial schema. See ../../SCHEMA.md — that document is the spec and
-- this file is its implementation.
--
-- Conventions enforced here rather than in application code:
--   * `id` is bigserial and never leaves the database.
--   * `public_id` is the only identifier the API emits.
--   * `tier` is a smallint ordinal, because every rule is `effective <= viewer + 1`.

CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------- enums

CREATE TYPE user_state       AS ENUM ('active', 'deleted');
CREATE TYPE link_kind        AS ENUM ('link', 'text', 'media');
CREATE TYPE media_type       AS ENUM ('image', 'video', 'audio');
CREATE TYPE tag_status       AS ENUM ('approved', 'pending');
CREATE TYPE suspension_type  AS ENUM ('mute', 'submission_ban', 'lockout', 'content_hold');
CREATE TYPE reason_category  AS ENUM ('spam', 'abuse', 'nsfw', 'other');
CREATE TYPE appeal_outcome   AS ENUM ('upheld', 'reduced', 'overturned');
CREATE TYPE subject_type     AS ENUM ('link', 'comment', 'user');
CREATE TYPE report_status    AS ENUM ('open', 'resolved');
CREATE TYPE notification_kind AS ENUM (
  'sanction', 'content_removed', 'content_retiered',
  'tier_changed', 'appeal_resolved', 'recovery_approved'
);

-- ---------------------------------------------------------------- identity

CREATE TABLE users (
  id          bigserial PRIMARY KEY,
  public_id   text        NOT NULL UNIQUE,
  username    citext      UNIQUE,               -- null once tombstoned
  tier        smallint    NOT NULL CHECK (tier BETWEEN 1 AND 5),
  state       user_state  NOT NULL DEFAULT 'active',
  show_nsfw   boolean     NOT NULL DEFAULT false,
  theme       text        NOT NULL DEFAULT 'system',
  display     jsonb       NOT NULL DEFAULT '{}'::jsonb,
  invited_by  bigint      REFERENCES users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz
);

-- Tier 5 is a set: multiple owners are permitted, and the last one cannot be
-- removed. The check lives in the application transaction (see owner routes)
-- because it is a cross-row invariant.

CREATE TABLE identities (
  id       bigserial PRIMARY KEY,
  user_id  bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider text   NOT NULL,
  subject  text   NOT NULL,
  password_hash text,                            -- local provider only
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, subject)
);
CREATE INDEX identities_user_idx ON identities (user_id);

CREATE TABLE sessions (
  id         bigserial PRIMARY KEY,
  user_id    bigint      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text        NOT NULL UNIQUE,        -- sha256; the token itself is never stored
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sessions_user_idx ON sessions (user_id);

CREATE TABLE api_tokens (
  id           bigserial PRIMARY KEY,
  user_id      bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  public_id    text   NOT NULL UNIQUE,
  token_hash   text   NOT NULL UNIQUE,
  name         text   NOT NULL,
  last_used_at timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  revoked_at   timestamptz
);
CREATE INDEX api_tokens_user_idx ON api_tokens (user_id);

CREATE TABLE recovery_codes (
  id         bigserial PRIMARY KEY,
  user_id    bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash  text   NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  used_at    timestamptz
);
CREATE INDEX recovery_codes_user_idx ON recovery_codes (user_id);

CREATE TABLE recovery_requests (
  id          bigserial PRIMARY KEY,
  user_id     bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  note        text   NOT NULL DEFAULT '',
  ip_hash     text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  resolved_by bigint REFERENCES users(id),
  resolved_at timestamptz
);
-- One open request per account, so the queue cannot be flooded on anyone's behalf.
CREATE UNIQUE INDEX recovery_requests_one_open
  ON recovery_requests (user_id) WHERE resolved_at IS NULL;
CREATE INDEX recovery_requests_open_age
  ON recovery_requests (created_at) WHERE resolved_at IS NULL;

CREATE TABLE invites (
  id          bigserial PRIMARY KEY,
  code_hash   text   NOT NULL UNIQUE,
  issued_by   bigint NOT NULL REFERENCES users(id),
  issued_at   timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL,
  consumed_by bigint REFERENCES users(id),
  consumed_at timestamptz,
  revoked_at  timestamptz,
  note        text
);
CREATE INDEX invites_issuer_idx ON invites (issued_by, issued_at DESC);

-- ---------------------------------------------------------------- content

CREATE TABLE categories (
  id         bigserial PRIMARY KEY,
  slug       text NOT NULL UNIQUE,
  name       text NOT NULL,
  created_by bigint REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE tags (
  id         bigserial PRIMARY KEY,
  slug       text       NOT NULL UNIQUE,
  name       text       NOT NULL,
  status     tag_status NOT NULL DEFAULT 'approved',
  created_by bigint     REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX tags_pending_idx ON tags (created_at) WHERE status = 'pending';

CREATE TABLE links (
  id                  bigserial PRIMARY KEY,
  public_id           text      NOT NULL UNIQUE,
  kind                link_kind NOT NULL,
  url                 text,
  url_canonical       text,      -- indexed, NOT unique: dedup is scoped to the submitter
  media_type          media_type,
  title               text      NOT NULL,
  body                text,
  host                text,
  search_vec          tsvector  NOT NULL DEFAULT ''::tsvector,
  thumb_key           text,
  favicon_key         text,
  category_id         bigint    NOT NULL REFERENCES categories(id),
  author_id           bigint    NOT NULL REFERENCES users(id),
  author_tier_at_post smallint  NOT NULL,        -- audit only, never queried for visibility
  pinned_tier         smallint,
  is_nsfw             boolean   NOT NULL DEFAULT false,
  created_at          timestamptz NOT NULL DEFAULT now(),
  edited_at           timestamptz,
  removed_at          timestamptz,
  removed_reason      text,
  CHECK ((kind = 'text') = (url IS NULL))
);

CREATE TABLE link_revisions (
  id         bigserial PRIMARY KEY,
  link_id    bigint NOT NULL REFERENCES links(id) ON DELETE CASCADE,
  seq        int    NOT NULL,
  title      text   NOT NULL,
  body       text,
  editor_id  bigint NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (link_id, seq)
);

CREATE TABLE link_tags (
  link_id bigint NOT NULL REFERENCES links(id) ON DELETE CASCADE,
  tag_id  bigint NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (link_id, tag_id)
);

CREATE TABLE votes (
  link_id    bigint   NOT NULL REFERENCES links(id) ON DELETE CASCADE,
  user_id    bigint   NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  value      smallint NOT NULL CHECK (value IN (1)),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (link_id, user_id)
);

-- One true global score per link, identical for every viewer. See GAPS.md for
-- what that concedes.
CREATE TABLE link_scores (
  link_id    bigint PRIMARY KEY REFERENCES links(id) ON DELETE CASCADE,
  score      int    NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE bookmarks (
  user_id    bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  link_id    bigint NOT NULL REFERENCES links(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, link_id)
);

CREATE TABLE notifications (
  id         bigserial PRIMARY KEY,
  public_id  text NOT NULL UNIQUE,
  user_id    bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind       notification_kind NOT NULL,
  payload    jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at    timestamptz
);

-- Reserved. Schema is fixed because the invisible-parent rule constrains it;
-- there is no API and no UI. See GAPS.md.
CREATE TABLE comments (
  id                  bigserial PRIMARY KEY,
  public_id           text   NOT NULL UNIQUE,
  link_id             bigint NOT NULL REFERENCES links(id) ON DELETE CASCADE,
  parent_id           bigint REFERENCES comments(id) ON DELETE CASCADE,
  path                text   NOT NULL DEFAULT '',   -- materialised path, truncatable server-side
  author_id           bigint NOT NULL REFERENCES users(id),
  author_tier_at_post smallint NOT NULL,
  pinned_tier         smallint,
  body                text   NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  edited_at           timestamptz,
  removed_at          timestamptz
);

-- ---------------------------------------------------------------- moderation

CREATE TABLE reports (
  id           bigserial PRIMARY KEY,
  public_id    text NOT NULL UNIQUE,
  subject_type subject_type NOT NULL,
  subject_id   bigint NOT NULL,
  reporter_id  bigint REFERENCES users(id),      -- never exposed to the reported party
  reason       text   NOT NULL,
  note         text,
  status       report_status NOT NULL DEFAULT 'open',
  created_at   timestamptz NOT NULL DEFAULT now(),
  resolved_by  bigint REFERENCES users(id),
  resolved_at  timestamptz,
  resolution   text
);
CREATE INDEX reports_open_idx ON reports (created_at DESC) WHERE resolved_at IS NULL;

CREATE TABLE suspensions (
  id              bigserial PRIMARY KEY,
  public_id       text NOT NULL UNIQUE,
  user_id         bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  types           suspension_type[] NOT NULL,
  expires_at      timestamptz,                    -- null means indefinite
  reason_category reason_category NOT NULL,
  note            text,
  created_by      bigint NOT NULL REFERENCES users(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  lifted_by       bigint REFERENCES users(id),
  lifted_at       timestamptz
);
CREATE INDEX suspensions_active_idx ON suspensions (user_id) WHERE lifted_at IS NULL;
CREATE INDEX suspensions_indefinite_idx
  ON suspensions (created_at) WHERE lifted_at IS NULL AND expires_at IS NULL;

CREATE TABLE appeals (
  id            bigserial PRIMARY KEY,
  public_id     text NOT NULL UNIQUE,
  -- The unique constraint is the whole mechanism: one appeal per sanction,
  -- enforced by the database rather than by application logic.
  suspension_id bigint NOT NULL UNIQUE REFERENCES suspensions(id) ON DELETE CASCADE,
  user_id       bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body          text   NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  resolved_by   bigint REFERENCES users(id),
  resolved_at   timestamptz,
  outcome       appeal_outcome,
  outcome_note  text
);
CREATE INDEX appeals_open_idx ON appeals (created_at) WHERE resolved_at IS NULL;

CREATE TABLE audit_log (
  id           bigserial PRIMARY KEY,
  actor_id     bigint REFERENCES users(id),
  action       text NOT NULL,
  subject_type text NOT NULL,
  subject_id   text,
  before       jsonb,
  after        jsonb,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_log_time_idx ON audit_log (created_at DESC);
CREATE INDEX audit_log_subject_idx ON audit_log (subject_type, subject_id);

-- Append-only. The deployment docs also revoke UPDATE/DELETE from the
-- application role; this trigger is the copy that travels with the schema, so a
-- misconfigured grant still cannot rewrite history.
CREATE FUNCTION audit_log_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_log_no_update BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION audit_log_append_only();

CREATE TABLE settings (
  key             text PRIMARY KEY,
  value           jsonb NOT NULL,
  min_writer_tier smallint NOT NULL DEFAULT 4,
  updated_by      bigint REFERENCES users(id),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------- rate limits

-- Fixed-window counters. In Postgres rather than in memory because a serverless
-- deployment has no memory to share between invocations.
CREATE TABLE rate_limits (
  key          text PRIMARY KEY,
  window_start timestamptz NOT NULL,
  count        int NOT NULL
);
CREATE INDEX rate_limits_window_idx ON rate_limits (window_start);

-- ---------------------------------------------------------------- search

-- `search_vec` covers title, body and tag names. Tag names live in another
-- table, so this cannot be a generated column; a trigger keeps it current from
-- both sides.
CREATE FUNCTION link_search_vec(p_link_id bigint) RETURNS tsvector AS $$
  SELECT
    setweight(to_tsvector('english', coalesce(l.title, '')), 'A')
    || setweight(to_tsvector('english', coalesce(l.body, '')), 'B')
    || setweight(to_tsvector('english', coalesce(
         (SELECT string_agg(t.name, ' ') FROM link_tags lt
            JOIN tags t ON t.id = lt.tag_id WHERE lt.link_id = l.id), '')), 'C')
  FROM links l WHERE l.id = p_link_id;
$$ LANGUAGE sql STABLE;

CREATE FUNCTION links_refresh_search_vec() RETURNS trigger AS $$
BEGIN
  UPDATE links SET search_vec = link_search_vec(NEW.id) WHERE id = NEW.id;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER links_search_vec_aiu AFTER INSERT OR UPDATE OF title, body ON links
  FOR EACH ROW EXECUTE FUNCTION links_refresh_search_vec();

CREATE FUNCTION link_tags_refresh_search_vec() RETURNS trigger AS $$
DECLARE
  target bigint := coalesce(NEW.link_id, OLD.link_id);
BEGIN
  UPDATE links SET search_vec = link_search_vec(target) WHERE id = target;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER link_tags_search_vec_aid AFTER INSERT OR DELETE ON link_tags
  FOR EACH ROW EXECUTE FUNCTION link_tags_refresh_search_vec();

-- ---------------------------------------------------------------- indexes

CREATE INDEX links_feed_idx        ON links (created_at DESC, id DESC);
CREATE INDEX links_category_idx    ON links (category_id, created_at DESC);
CREATE INDEX links_canonical_idx   ON links (url_canonical);
CREATE INDEX links_author_idx      ON links (author_id);
CREATE INDEX links_search_idx      ON links USING GIN (search_vec);
CREATE INDEX link_tags_tag_idx     ON link_tags (tag_id, link_id);
CREATE INDEX votes_user_idx        ON votes (user_id);
CREATE INDEX bookmarks_user_idx    ON bookmarks (user_id, created_at DESC);
CREATE INDEX notifications_user_idx ON notifications (user_id, created_at DESC);
CREATE INDEX notifications_unread_idx ON notifications (user_id) WHERE read_at IS NULL;
CREATE INDEX link_revisions_idx    ON link_revisions (link_id, seq DESC);
CREATE INDEX comments_link_idx     ON comments (link_id, path);

-- ---------------------------------------------------------------- seed

INSERT INTO settings (key, value, min_writer_tier) VALUES
  ('setup_complete',   'false'::jsonb, 5),
  ('invite_min_tier',  '4'::jsonb,     5),  -- owner-writable only. See VISIBILITY.md.
  ('invite_ttl_days',  '14'::jsonb,    4),
  ('instance_name',    '"okmeme"'::jsonb, 4),
  ('signup_open',      'true'::jsonb,  4);
