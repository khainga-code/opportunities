package recipe

import (
	"context"
	"encoding/json"
	"fmt"
	"net/url"
	"strings"

	"github.com/PaesslerAG/jsonpath"
	"github.com/PuerkitoBio/goquery"
	"github.com/stawi-opportunities/opportunities/pkg/domain"
)

// Executor runs a recipe deterministically — no LLM. It is constructed per
// source with that source's active recipe and a Fetcher for HTTP.
type Executor struct {
	recipe  *Recipe
	fetcher Fetcher
}

// NewExecutor builds an Executor for a recipe + fetcher.
func NewExecutor(r *Recipe, f Fetcher) *Executor {
	return &Executor{recipe: r, fetcher: f}
}

// apiPage fetches one api-mode page from pageURL, parses the records under
// List.ItemsPath, and builds an opportunity per record. It returns the page's
// items, the raw body, the HTTP status, the root JSON (for cursor pagination),
// and any error.
func (e *Executor) apiPage(ctx context.Context, src domain.Source, pageURL string) (items []domain.ExternalOpportunity, raw []byte, status int, root any, err error) {
	raw, status, err = e.fetcher.Get(ctx, pageURL)
	if err != nil {
		return nil, raw, status, nil, err
	}
	if status < 200 || status >= 300 {
		return nil, raw, status, nil, fmt.Errorf("api page %s returned status %d", pageURL, status)
	}
	if err = json.Unmarshal(raw, &root); err != nil {
		return nil, raw, status, nil, fmt.Errorf("api page %s: invalid JSON: %w", pageURL, err)
	}
	recsVal, err := jsonpath.Get(e.recipe.List.ItemsPath, root)
	if err != nil {
		return nil, raw, status, root, fmt.Errorf("api page %s: items_path %q: %w", pageURL, e.recipe.List.ItemsPath, err)
	}
	recs, ok := recsVal.([]any)
	if !ok {
		return nil, raw, status, root, nil
	}
	for _, rv := range recs {
		rec, ok := rv.(map[string]any)
		if !ok {
			continue
		}
		pc, perr := NewPageContext(pageURL, "", rec)
		if perr != nil {
			return nil, raw, status, root, perr
		}
		opp, berr := buildOpportunity(pc, src, e.recipe)
		if berr != nil {
			return nil, raw, status, root, berr
		}
		items = append(items, opp)
	}
	return items, raw, status, root, nil
}

// htmlPage fetches one listing page, enumerates detail URLs via the recipe's
// ItemSelector + Link, fetches each same-host detail page, and builds an
// opportunity from it. Cross-host detail links are skipped (SSRF guard).
// It returns the items, the listing's raw body, its HTTP status, the listing
// PageContext (for next-link pagination), and any error.
func (e *Executor) htmlPage(ctx context.Context, src domain.Source, listURL string) (items []domain.ExternalOpportunity, raw []byte, status int, listPC *PageContext, err error) {
	raw, status, err = e.fetcher.Get(ctx, listURL)
	if err != nil {
		return nil, raw, status, nil, err
	}
	if status < 200 || status >= 300 {
		return nil, raw, status, nil, fmt.Errorf("listing %s returned status %d", listURL, status)
	}
	listPC, err = NewPageContext(listURL, string(raw), nil)
	if err != nil {
		return nil, raw, status, nil, err
	}

	detailURLs := e.collectDetailURLs(listPC, listURL)
	for _, du := range detailURLs {
		if !sameHost(src.BaseURL, du) {
			continue
		}
		body, st, ferr := e.fetcher.Get(ctx, du)
		if ferr != nil {
			return items, raw, status, listPC, ferr
		}
		if st < 200 || st >= 300 {
			continue
		}
		pc, perr := NewPageContext(du, string(body), nil)
		if perr != nil {
			return items, raw, status, listPC, perr
		}
		opp, berr := buildOpportunity(pc, src, e.recipe)
		if berr != nil {
			return items, raw, status, listPC, berr
		}
		items = append(items, opp)
	}
	return items, raw, status, listPC, nil
}

// collectDetailURLs evaluates the recipe's Link extractor inside each
// ItemSelector match, returning resolved detail URLs.
func (e *Executor) collectDetailURLs(listPC *PageContext, listURL string) []string {
	if listPC.HTML == nil || e.recipe.List.ItemSelector == "" {
		return nil
	}
	var urls []string
	listPC.HTML.Find(e.recipe.List.ItemSelector).Each(func(_ int, item *goquery.Selection) {
		outer, oerr := goquery.OuterHtml(item)
		if oerr != nil {
			return
		}
		itemPC, perr := NewPageContext(listURL, outer, nil)
		if perr != nil {
			return
		}
		if link, _ := Evaluate(e.recipe.List.Link, itemPC); link != "" {
			urls = append(urls, link)
		}
	})
	return urls
}

// sameHost reports whether target shares base's host (SSRF guard). A target
// that fails to parse, or a base without a host, is treated as not-same-host.
func sameHost(base, target string) bool {
	b, err := url.Parse(base)
	if err != nil || b.Host == "" {
		return false
	}
	t, err := url.Parse(target)
	if err != nil {
		return false
	}
	return strings.EqualFold(b.Host, t.Host)
}
