-- Thumbnails and favicons as an instance setting, so an operator with nowhere
-- free to keep bytes can run without them and turn them on later.
--
-- Admin-writable (4). It is a cosmetic switch: with it off no image is stored
-- and none is served, and the client falls back to the tinted host letter it
-- already draws for a target with no preview image. It never falls back to
-- loading the image from the source host — that would hand every viewer's IP
-- to whoever hosts it, which in a tiered system counts the readers below you.
--
-- Defaults on, matching the behaviour of every instance that existed before
-- this migration. `ON CONFLICT DO NOTHING` so re-running cannot flip an
-- instance that has already made a choice.

INSERT INTO settings (key, value, min_writer_tier) VALUES
  ('thumbnails_enabled', 'true'::jsonb, 4)
ON CONFLICT (key) DO NOTHING;
