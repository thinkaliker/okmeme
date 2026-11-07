-- Favicons as their own instance setting, off by default.
--
-- Until now one switch, `thumbnails_enabled`, covered both preview images and
-- site icons. Favicons now have their own, and it starts off: with it off no
-- favicon is fetched at submission, none is served, and `favicon_key` comes
-- back null on every link, so the client draws nothing beside the kind icon.
-- Keys already written stay in `links.favicon_key` and the images stay in the
-- blob store, so switching it on restores them with no backfill.
--
-- Admin-writable (4), like `thumbnails_enabled`. "Off" never means loading the
-- icon from the site the link points at — a 16px image is enough to count the
-- readers of a tier.
--
-- `ON CONFLICT DO NOTHING` so re-running cannot flip an instance that has
-- already made a choice.

INSERT INTO settings (key, value, min_writer_tier) VALUES
  ('favicons_enabled', 'false'::jsonb, 4)
ON CONFLICT (key) DO NOTHING;
