// This directory contains the frontend (Hugo/JS) projects, not Go code.
// It carries its own go.mod purely as a module boundary so the root module's
// `./...` (build, vet, test, golangci-lint) never descends into the stray Go
// files some npm packages ship under node_modules (e.g. flatted/golang).
// There is no Go source of ours here.
module github.com/stawi-opportunities/opportunities/ui

go 1.26
