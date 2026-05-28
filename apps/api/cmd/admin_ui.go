package main

import (
	"context"
	"embed"
	"io/fs"
	"net/http"
	"strings"

	"github.com/pitabwire/util"
)

// adminUIFS embeds the React SPA built by ui/admin/. The Dockerfile's
// ui-builder stage produces ui/admin/dist/ and the go-builder stage
// copies it into apps/api/cmd/adminui/ before `go build`, so the
// binary ships with the assets. Locally (no Vite build), the embed
// resolves to just the .gitkeep anchor and the handler returns 503 —
// devs run `cd ui/admin && npm run dev` for the live SPA.
//
//go:embed all:adminui
var adminUIFS embed.FS

// registerAdminUI serves the admin SPA at /admin/. SPA semantics:
// requests that don't match a static asset fall back to index.html
// so client-side react-router routes (/admin/sources, /admin/trace/...)
// resolve correctly on first load + page reload.
//
// Auth: this handler serves bytes unauthenticated by design. The React
// app self-gates via @stawi/auth-runtime.getRoles(); the security
// boundary is the requireAdmin middleware on /admin/* API endpoints.
func registerAdminUI(ctx context.Context, mux *http.ServeMux) {
	log := util.Log(ctx)
	sub, err := fs.Sub(adminUIFS, "adminui")
	if err != nil {
		log.WithError(err).Error("admin ui: fs.Sub failed; route not registered")
		return
	}
	indexBytes, indexErr := fs.ReadFile(sub, "index.html")
	fileServer := http.FileServer(http.FS(sub))

	mux.HandleFunc("GET /admin/", func(w http.ResponseWriter, r *http.Request) {
		// /admin/api/* and /admin/*.json etc. are API routes — they're
		// registered elsewhere; this catch-all only fires for paths the
		// mux didn't match more specifically. So if we land here, it's a
		// UI route or a static asset.
		rel := strings.TrimPrefix(r.URL.Path, "/admin/")
		if rel == "" {
			rel = "index.html"
		}
		if _, statErr := fs.Stat(sub, rel); statErr == nil {
			http.StripPrefix("/admin/", fileServer).ServeHTTP(w, r)
			return
		}
		// SPA fallback.
		if indexErr != nil {
			http.Error(w, "admin ui not built — run `cd ui/admin && npm run build`", http.StatusServiceUnavailable)
			return
		}
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.Header().Set("Cache-Control", "no-cache")
		_, _ = w.Write(indexBytes)
	})

	if indexErr != nil {
		log.Warn("admin ui: registered at /admin/ but no index.html embedded — local dev build")
	} else {
		log.WithField("index_bytes", len(indexBytes)).Info("admin ui: registered at /admin/")
	}
}
