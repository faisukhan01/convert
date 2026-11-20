// Package metrics maintains a lightweight, dependency-free metrics registry
// exported in Prometheus text exposition format at /metrics. Counters only —
// the engine's operational story is event counts and states, which keeps the
// format trivial to scrape and trivial to test.
package metrics

import (
	"fmt"
	"net/http"
	"sort"
	"strings"
	"sync"
)

// Counter names used across the engine.
const (
	CounterIngestTotal   = "engine_ingest_total"
	CounterProcessed     = "engine_events_processed_total"
	CounterDuplicates    = "engine_events_duplicate_total"
	CounterInvalidTotal  = "engine_events_invalid_total"
	CounterSigFailures   = "engine_signature_failures_total"
	CounterOutOfOrder    = "engine_events_out_of_order_total"
	CounterRateLimited   = "engine_events_rate_limited_total"
	CounterQueueOverflow = "engine_queue_overflow_total"
	CounterReplays       = "engine_replays_total"
	CounterActionsTotal  = "engine_actions_total"
	CounterHTTPRequests  = "engine_http_requests_total"

	CounterGHLCallsTotal  = "engine_ghl_api_calls_total"
	CounterGHLErrorsTotal = "engine_ghl_api_errors_total"
	CounterDBWritesTotal  = "engine_db_writes_total"
	CounterAICallsTotal   = "engine_ai_calls_total"
	CounterRulesMatched   = "engine_rules_matched_total"
	CounterScoredTotal    = "engine_leads_scored_total"
)

// Registry stores counters and their help strings.
type Registry struct {
	mu       sync.Mutex
	counters map[string]*counter
}

type counter struct {
	help  string
	value uint64
	// byLabel aggregates per-label-series values (e.g. route, status).
	byLabel map[string]uint64
}

// NewRegistry builds an empty registry pre-seeded with engine counters.
func NewRegistry() *Registry {
	r := &Registry{counters: make(map[string]*counter)}
	seed := map[string]string{
		CounterIngestTotal:   "Inbound webhook deliveries accepted by the ingest path.",
		CounterProcessed:     "Events fully processed (normalized + planned + enqueued).",
		CounterDuplicates:    "Redeliveries collapsed by the idempotency guard.",
		CounterInvalidTotal:  "Events rejected as structurally invalid.",
		CounterSigFailures:   "Events rejected by HMAC signature verification.",
		CounterOutOfOrder:    "Events deferred by ordering or backpressure guards.",
		CounterRateLimited:   "Events denied by the per-location rate limiter.",
		CounterQueueOverflow: "Actions rejected due to bounded queue capacity.",
		CounterReplays:       "Events recovered through the replay path.",
		CounterActionsTotal:  "Automation actions executed by workers.",
		CounterHTTPRequests:  "HTTP requests served, labeled by route and status.",

		CounterGHLCallsTotal:  "Outbound GoHighLevel API calls attempted by the executor.",
		CounterGHLErrorsTotal: "GoHighLevel API calls that ended in a provider error.",
		CounterDBWritesTotal:  "Rows mirrored into the durable Postgres store.",
		CounterAICallsTotal:   "z.ai brain calls (qualification + reply drafting).",
		CounterRulesMatched:   "Rule matches produced by the routing ruleset.",
		CounterScoredTotal:    "Lead scoring computations performed.",
	}
	for name, help := range seed {
		r.counters[name] = &counter{help: help, byLabel: make(map[string]uint64)}
	}
	return r
}

// Inc bumps a counter by one.
func (r *Registry) Inc(name string) { r.Add(name, 1) }

// Add bumps a counter by n.
func (r *Registry) Add(name string, n uint64) {
	r.mu.Lock()
	defer r.mu.Unlock()
	c, ok := r.counters[name]
	if !ok {
		c = &counter{help: "Extension counter.", byLabel: make(map[string]uint64)}
		r.counters[name] = c
	}
	c.value += n
}

// IncLabeled bumps the labeled series of a counter (e.g. route="/v1/webhooks/ghl", status="200").
func (r *Registry) IncLabeled(name string, labels map[string]string) {
	r.mu.Lock()
	defer r.mu.Unlock()
	c, ok := r.counters[name]
	if !ok {
		c = &counter{help: "Extension counter.", byLabel: make(map[string]uint64)}
		r.counters[name] = c
	}
	c.byLabel[labelKey(labels)]++
}

// Snapshot returns a deep-enough copy for stats endpoints.
func (r *Registry) Snapshot() map[string]any {
	r.mu.Lock()
	defer r.mu.Unlock()
	out := make(map[string]any, len(r.counters))
	for name, c := range r.counters {
		entry := map[string]any{"total": c.value}
		if len(c.byLabel) > 0 {
			entry["series"] = c.byLabel
		}
		out[name] = entry
	}
	return out
}

// ServeHTTP renders the Prometheus text format.
func (r *Registry) ServeHTTP(w http.ResponseWriter, _ *http.Request) {
	r.mu.Lock()
	defer r.mu.Unlock()

	var b strings.Builder
	names := make([]string, 0, len(r.counters))
	for name := range r.counters {
		names = append(names, name)
	}
	sort.Strings(names)

	for _, name := range names {
		c := r.counters[name]
		fmt.Fprintf(&b, "# HELP %s %s\n", name, sanitizeHelp(c.help))
		fmt.Fprintf(&b, "# TYPE %s counter\n", name)
		if len(c.byLabel) == 0 {
			fmt.Fprintf(&b, "%s %d\n", name, c.value)
			continue
		}
		fmt.Fprintf(&b, "%s %d\n", name, c.value) // grand total line
		keys := make([]string, 0, len(c.byLabel))
		for k := range c.byLabel {
			keys = append(keys, k)
		}
		sort.Strings(keys)
		for _, k := range keys {
			fmt.Fprintf(&b, "%s%s %d\n", name, k, c.byLabel[k])
		}
	}
	w.Header().Set("Content-Type", "text/plain; version=0.0.4; charset=utf-8")
	_, _ = w.Write([]byte(b.String()))
}

func labelKey(labels map[string]string) string {
	keys := make([]string, 0, len(labels))
	for k := range labels {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	var b strings.Builder
	b.WriteByte('{')
	for i, k := range keys {
		if i > 0 {
			b.WriteString(",")
		}
		fmt.Fprintf(&b, "%s=%q", k, labels[k])
	}
	b.WriteByte('}')
	return b.String()
}

func sanitizeHelp(s string) string {
	s = strings.ReplaceAll(s, "\\", "\\\\")
	return strings.ReplaceAll(s, "\n", "\\n")
}
