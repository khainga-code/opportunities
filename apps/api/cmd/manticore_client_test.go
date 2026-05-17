package main

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/require"
	"github.com/stawi-opportunities/opportunities/pkg/searchindex"
)

func TestJobsManticore_GetByID(t *testing.T) {
	// Manticore returns the row keyed by numeric _id (hashID of the
	// canonical-id "can-1") with the polymorphic-schema column names.
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"hits":{"total":1,"hits":[{"_id":42,"_score":1,"_source":{"kind":"job","title":"Engineer","issuing_entity":"Acme","country":"KE","geo_scope":"remote"}}]}}`))
	}))
	defer ts.Close()

	client, err := searchindex.Open(searchindex.Config{URL: ts.URL})
	require.NoError(t, err)
	jm := newJobsManticore(client)

	job, err := jm.GetByID(context.Background(), "can-1")
	require.NoError(t, err)
	require.NotNil(t, job)
	require.Equal(t, uint64(42), job.ID)
	require.Equal(t, "Engineer", job.Title)
	require.Equal(t, "Acme", job.IssuingEntity)
}

func TestJobsManticore_Count(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"hits":{"total":1234,"hits":[]}}`))
	}))
	defer ts.Close()

	client, _ := searchindex.Open(searchindex.Config{URL: ts.URL})
	jm := newJobsManticore(client)

	n, err := jm.Count(context.Background(), nil)
	require.NoError(t, err)
	require.Equal(t, 1234, n)
}
