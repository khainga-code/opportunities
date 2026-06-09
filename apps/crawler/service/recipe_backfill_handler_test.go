package service

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stawi-opportunities/opportunities/pkg/domain"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type fakeLister struct{ srcs []*domain.Source }

func (f fakeLister) ListByStatuses(_ context.Context, _ []domain.SourceStatus, _ int) ([]*domain.Source, error) {
	return f.srcs, nil
}

func bfSource(id string, typ domain.SourceType, recipe string, tuning bool) *domain.Source {
	s := &domain.Source{Type: typ, ExtractionRecipe: recipe, NeedsTuning: tuning}
	s.ID = id
	s.Status = domain.SourceActive
	return s
}

func TestRecipeBackfillHandler_EnqueuesOnlyEligible(t *testing.T) {
	lister := fakeLister{srcs: []*domain.Source{
		bfSource("a", "brightermonday", "{}", false),                  // eligible -> queue
		bfSource("b", "brightermonday", `{"acquisition":"x"}`, false), // has recipe -> skip
		bfSource("c", "greenhouse", "{}", false),                      // not a target type -> skip
		bfSource("d", "jobberman", "{}", true),                        // needs_tuning -> skip
		bfSource("e", "jobberman", "", false),                         // eligible -> queue
	}}
	var queued []string
	emit := func(_ context.Context, id string) error { queued = append(queued, id); return nil }

	h := RecipeBackfillHandler(RecipeBackfillDeps{
		Sources: lister, Enabled: true, Targets: UniversalRecipeTargets, Emit: emit, Limit: 100,
	})
	rec := httptest.NewRecorder()
	h(rec, httptest.NewRequest(http.MethodPost, "/admin/recipes/backfill", nil))

	require.Equal(t, http.StatusOK, rec.Code)
	assert.ElementsMatch(t, []string{"a", "e"}, queued)
	assert.Contains(t, rec.Body.String(), `"queued":2`)
}

func TestRecipeBackfillHandler_DisabledNoOps(t *testing.T) {
	var queued []string
	emit := func(_ context.Context, id string) error { queued = append(queued, id); return nil }
	h := RecipeBackfillHandler(RecipeBackfillDeps{
		Sources: fakeLister{srcs: []*domain.Source{bfSource("a", "brightermonday", "{}", false)}},
		Enabled: false, Targets: UniversalRecipeTargets, Emit: emit,
	})
	rec := httptest.NewRecorder()
	h(rec, httptest.NewRequest(http.MethodPost, "/admin/recipes/backfill", nil))

	require.Equal(t, http.StatusOK, rec.Code)
	assert.Empty(t, queued)
	assert.Contains(t, rec.Body.String(), "disabled")
}
