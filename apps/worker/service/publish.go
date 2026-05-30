package service

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/pitabwire/frame"
	"github.com/pitabwire/util"

	eventsv1 "github.com/stawi-opportunities/opportunities/pkg/events/v1"
	"github.com/stawi-opportunities/opportunities/pkg/opportunity"
	"github.com/stawi-opportunities/opportunities/pkg/publish"
	"github.com/stawi-opportunities/opportunities/pkg/variantstate"
)

// PublishHandler consumes CanonicalUpsertedV1 and writes a JSON
// snapshot to R2, then emits PublishedV1.
type PublishHandler struct {
	svc       *frame.Service
	publisher *publish.R2Publisher
	registry  *opportunity.Registry
	store     *variantstate.Store // nil-safe; soft-fails on Postgres outage
}

// NewPublishHandler ...
func NewPublishHandler(svc *frame.Service, p *publish.R2Publisher, reg *opportunity.Registry, store *variantstate.Store) *PublishHandler {
	return &PublishHandler{svc: svc, publisher: p, registry: reg, store: store}
}

// Name returns the topic this handler consumes (canonical upserts).
// It is not registered directly — the CanonicalFanout in service.go
// calls Execute on each sub-handler under one registry entry.
func (h *PublishHandler) Name() string { return eventsv1.TopicCanonicalsUpserted }

// PayloadType ...
func (h *PublishHandler) PayloadType() any {
	var raw json.RawMessage
	return &raw
}

// Validate ...
func (h *PublishHandler) Validate(_ context.Context, payload any) error {
	raw, ok := payload.(*json.RawMessage)
	if !ok || raw == nil || len(*raw) == 0 {
		return errors.New("publish: empty payload")
	}
	return nil
}

// Execute writes the snapshot and emits PublishedV1.
func (h *PublishHandler) Execute(ctx context.Context, payload any) error {
	if h.publisher == nil {
		return nil // publisher not configured — skip
	}
	raw := payload.(*json.RawMessage)
	var env eventsv1.Envelope[eventsv1.CanonicalUpsertedV1]
	if err := json.Unmarshal(*raw, &env); err != nil {
		return err
	}
	c := env.Payload

	snap, err := json.Marshal(c)
	if err != nil {
		return fmt.Errorf("publish: marshal: %w", err)
	}
	spec := h.registry.Resolve(c.Kind)
	key := publish.ObjectKey(spec.URLPrefix, c.Slug)
	if err := h.publisher.UploadPublicSnapshot(ctx, key, snap); err != nil {
		// CRITICAL: R2 publish failures must NOT propagate to the shared
		// events consumer. Returning the error here Nacks the message,
		// and because all five pipeline stages multiplex onto ONE NATS
		// consumer with no app-level max-deliver/DLQ, an R2 outage turns
		// into an infinite-redelivery Nack-storm that back-pressures and
		// starves every other stage (the ~18h "0 published" incident).
		//
		// Instead: log WARN, record the error against the canonical's
		// variants for the ledger, and ACK (return nil). The variants
		// stay at `canonical` (NOT advanced to `published`); the reaper
		// re-drives them once R2 is healthy again.
		wrapped := fmt.Errorf("publish: upload: %w", err)
		util.Log(ctx).WithError(wrapped).
			WithField("canonical_id", c.OpportunityID).
			WithField("key", key).
			Warn("publish: R2 upload failed; acking to protect shared consumer, reaper will re-drive")
		_ = h.store.RecordErrorByCanonical(ctx, c.OpportunityID, variantstate.StageCanonical, wrapped)
		return nil
	}

	out := eventsv1.PublishedV1{
		OpportunityID: c.OpportunityID,
		Slug:          c.Slug,
		Kind:          c.Kind,
		R2Version:     int(time.Now().Unix()),
		PublishedAt:   time.Now().UTC(),
	}
	outEnv := eventsv1.NewEnvelope(eventsv1.TopicPublished, out)
	if err := h.svc.EventsManager().Emit(ctx, eventsv1.TopicPublished, outEnv); err != nil {
		return err
	}
	// Bulk-advance every variant in this canonical from `canonical`
	// → `published`. CanonicalUpsertedV1 is a many-to-one fan-in
	// (multiple variants share a canonical), so update by canonical_id.
	_ = h.store.MarkPublishedByCanonical(ctx, c.OpportunityID)
	return nil
}
