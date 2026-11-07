-- Per-tier permission overrides.
--
-- What each tier may do has been a constant in src/tier.ts. It is now a default,
-- and admins and owners may change it for tiers below their own. A row here is
-- an override of one cell; no row means the default, so an instance that
-- touches nothing behaves exactly as it did before this migration.
--
-- Owners (tier 5) have no row by construction: nobody sits above an owner to
-- change what one may do. Anonymous (tier 0) is not an account and has none
-- either. Which cells are configurable at all is decided in src/permissions.ts;
-- the API ignores an override on a cell it considers fixed.
--
-- Additive: the old code never reads this table.

CREATE TABLE tier_permissions (
  tier        smallint NOT NULL CHECK (tier BETWEEN 1 AND 4),
  capability  text NOT NULL,
  granted     boolean NOT NULL,
  updated_by  bigint REFERENCES users(id),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tier, capability)
);

-- DEPLOY.md (C8) grants the application role access to the tables that existed
-- when it was run. This one is read on every authenticated request, so a
-- missing grant would refuse every signed-in page. Grant it here when the role
-- the docs name exists; DEPLOY.md covers a role with any other name.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'okmeme_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON tier_permissions TO okmeme_app;
  END IF;
END
$$;
