-- lean-postgres-plan2: promote three filter-hot fields from
-- opportunities.attributes (JSONB) to top-level columns + partial
-- B-tree indexes scoped to the search predicate.
--
-- Eliminates the TOAST-out + JSON-path-extract on every list query
-- without changing what the API echoes (the attributes blob keeps
-- the original values so client payload shape is unchanged).
--
-- Idempotent: ADD COLUMN IF NOT EXISTS, CREATE INDEX IF NOT EXISTS,
-- backfill UPDATE has a WHERE-clause guard so re-runs are no-ops.

ALTER TABLE opportunities
    ADD COLUMN IF NOT EXISTS employment_type TEXT,
    ADD COLUMN IF NOT EXISTS seniority       TEXT,
    ADD COLUMN IF NOT EXISTS geo_scope       TEXT;

-- Backfill from existing JSONB. CPU-cheap even on TOASTed rows; the
-- WHERE guard skips rows already populated so re-runs are O(0).
UPDATE opportunities
   SET employment_type = NULLIF(attributes->>'employment_type', ''),
       seniority       = NULLIF(attributes->>'seniority', ''),
       geo_scope       = NULLIF(attributes->>'geo_scope', '')
 WHERE employment_type IS NULL
    OR seniority IS NULL
    OR geo_scope IS NULL;

-- Partial indexes scoped to the same predicate the existing
-- opportunities_kind_country_last_seen_idx uses, so the planner can
-- prune candidate rows efficiently for filtered list queries.
CREATE INDEX IF NOT EXISTS opportunities_employment_type_idx
    ON opportunities (employment_type)
    WHERE hidden = false AND status = 'active' AND employment_type IS NOT NULL;

CREATE INDEX IF NOT EXISTS opportunities_seniority_idx
    ON opportunities (seniority)
    WHERE hidden = false AND status = 'active' AND seniority IS NOT NULL;

CREATE INDEX IF NOT EXISTS opportunities_geo_scope_idx
    ON opportunities (geo_scope)
    WHERE hidden = false AND status = 'active' AND geo_scope IS NOT NULL;
