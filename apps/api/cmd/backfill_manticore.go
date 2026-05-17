package main

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"time"

	"github.com/pitabwire/util"

	"github.com/stawi-opportunities/opportunities/pkg/publish"
)

// r2Snapshotter is the minimal publish interface the backfill needs.
type r2Snapshotter interface {
	UploadPublicSnapshot(ctx context.Context, key string, body []byte) error
	TriggerDeploy(ctx context.Context) error
}

// backfillManticoreHandler scans idx_opportunities_rt and publishes a
// Hugo-shaped JSON snapshot for every active row under
// jobs/<numeric-id>.json. minQuality is accepted for handler compat but
// the polymorphic schema has no quality_score; the parameter is logged
// and otherwise ignored.
//
// Pagination: pages of 500 via ScrollActive — Manticore /search with
// offset/limit is fine at this scale (≤100k rows; deeper offsets would
// need cursor-based scrolling).
func backfillManticoreHandler(jm *jobsManticore, snap r2Snapshotter, defaultMinQuality float64) http.HandlerFunc {
	return func(w http.ResponseWriter, req *http.Request) {
		ctx := req.Context()
		qs := req.URL.Query()

		minQuality := defaultMinQuality
		if v := qs.Get("min_quality"); v != "" {
			if f, err := strconv.ParseFloat(v, 64); err == nil && f >= 0 {
				minQuality = f
			}
		}
		var sinceFilter *time.Time
		if v := qs.Get("since"); v != "" {
			if t, err := time.Parse(time.RFC3339, v); err == nil {
				sinceFilter = &t
			} else if t, err := time.Parse("2006-01-02", v); err == nil {
				sinceFilter = &t
			}
		}
		triggerDeploy := qs.Get("trigger_deploy") != "false"

		w.Header().Set("Content-Type", "application/x-ndjson")
		flusher, _ := w.(http.Flusher)

		var total, uploaded, skipped int

		err := jm.ScrollActive(ctx, minQuality, sinceFilter, 500, func(row job) error {
			total++
			// Public snapshot key uses the numeric id (decimal string)
			// since the polymorphic schema has no slug column.
			key := publish.ObjectKey("jobs", strconv.FormatUint(row.ID, 10))
			snapJSON, merr := json.Marshal(buildHugoDocFromJob(row))
			if merr != nil {
				skipped++
				return nil
			}
			if uerr := snap.UploadPublicSnapshot(ctx, key, snapJSON); uerr != nil {
				util.Log(ctx).WithError(uerr).WithField("id", row.ID).Warn("backfill: upload failed")
				skipped++
				return nil
			}
			uploaded++
			if uploaded%100 == 0 {
				_ = json.NewEncoder(w).Encode(map[string]any{
					"progress": true, "uploaded": uploaded, "skipped": skipped,
				})
				if flusher != nil {
					flusher.Flush()
				}
			}
			return nil
		})
		if err != nil {
			_ = json.NewEncoder(w).Encode(map[string]any{
				"error": err.Error(), "uploaded": uploaded, "skipped": skipped,
			})
			return
		}

		if triggerDeploy && uploaded > 0 {
			if derr := snap.TriggerDeploy(ctx); derr != nil {
				util.Log(ctx).WithError(derr).Warn("backfill: deploy trigger failed")
			}
		}

		_ = json.NewEncoder(w).Encode(map[string]any{
			"done":     true,
			"total":    total,
			"uploaded": uploaded,
			"skipped":  skipped,
		})
	}
}

// ScrollActive iterates idx_opportunities_rt over the active set,
// applying the same activeFilter() predicate the read-path uses
// (deadline-based, since the schema has no `status` column). minScore
// is accepted but ignored — there is no quality_score in the
// polymorphic schema; callers that want a ranking signal should
// post-filter on a column that exists (e.g. posted_at recency).
// callback is invoked once per row; returning a non-nil error halts.
// pageSize controls LIMIT per request; ≤0 → 500.
func (j *jobsManticore) ScrollActive(
	ctx context.Context,
	_ float64,
	since *time.Time,
	pageSize int,
	callback func(job) error,
) error {
	if pageSize <= 0 {
		pageSize = 500
	}

	filter := activeFilter()
	if since != nil {
		filter = append(filter, map[string]any{
			"range": map[string]any{
				"posted_at": map[string]any{"gte": since.Unix()},
			},
		})
	}

	for offset := 0; ; offset += pageSize {
		q := map[string]any{
			"index":  "idx_opportunities_rt",
			"query":  map[string]any{"bool": map[string]any{"filter": filter}},
			"sort":   []any{map[string]any{"posted_at": "desc"}},
			"limit":  pageSize,
			"offset": offset,
		}
		hits, total, err := j.search(ctx, q)
		if err != nil {
			return fmt.Errorf("scroll active (offset=%d): %w", offset, err)
		}
		for _, h := range hits {
			if err := callback(h); err != nil {
				return err
			}
		}
		if len(hits) == 0 || offset+len(hits) >= total {
			break
		}
	}
	return nil
}

// buildHugoDocFromJob serialises a Manticore job row into a JSON shape
// the Hugo snapshot consumer accepts. Field names use the polymorphic
// schema column names so future Hugo template updates can read straight
// from the live row without rename mapping.
func buildHugoDocFromJob(r job) map[string]any {
	doc := map[string]any{
		"id":              r.ID,
		"kind":            r.Kind,
		"title":           r.Title,
		"issuing_entity":  r.IssuingEntity,
		"description":     r.Description,
		"country":         r.Country,
		"region":          r.Region,
		"city":            r.City,
		"geo_scope":       r.GeoScope,
		"remote":          r.Remote,
		"employment_type": r.EmploymentType,
		"seniority":       r.Seniority,
		"field_of_study":  r.FieldOfStudy,
		"degree_level":    r.DegreeLevel,
		"categories":      r.Categories,
		"currency":        r.Currency,
		"amount_min":      r.AmountMin,
		"amount_max":      r.AmountMax,
	}
	if r.PostedAt != nil {
		doc["posted_at"] = *r.PostedAt
	} else {
		doc["posted_at"] = time.Time{}
	}
	if r.Deadline != nil {
		doc["deadline"] = *r.Deadline
	}
	return doc
}
