// Package server exposes the engine's HTTP surface:
//
//	POST /v1/webhooks/ghl   provider webhook ingest (HMAC verified)
//	GET  /v1/events         journal listing (filter by status)
//	GET  /v1/stats          operational snapshot
//	POST /v1/replay         re-drive recoverable events
//	GET  /v1/contacts       projection listing
//	POST /v1/demo/fire      self-fire a signed demo webhook (dev only)
//	GET  /healthz           liveness
//	GET  /readyz            readiness
//	GET  /metrics           Prometheus text format
package server

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"strconv"
	"strings"
	"sync/atomic"
	"time"

	"github.com/faisukhan01/convert/services/engine-go/internal/config"
	"github.com/faisukhan01/convert/services/engine-go/internal/eventlog"
	"github.com/faisukhan01/convert/services/engine-go/internal/httpx"
	"github.com/faisukhan01/convert/services/engine-go/internal/metrics"
	"github.com/faisukhan01/convert/services/engine-go/internal/pipeline"
	"github.com/faisukhan01/convert/services/engine-go/internal/queue"
	"github.com/faisukhan01/convert/services/engine-go/internal/ratelimit"
	"github.com/faisukhan01/convert/services/engine-go/internal/store"
	"github.com/faisukhan01/convert/services/engine-go/internal/version"
	"github.com/faisukhan01/convert/services/engine-go/internal/webhook/ghl"
)

// Server wires every dependency behind a single mux.
type Server struct {
	cfg       *config.Config
	orch      *pipeline.Orchestrator
	limiter   *ratelimit.Limiter
	proj      *store.MemStore
	metrics   *metrics.Registry
	queue     *queue.Queue
	ready     atomic.Bool
	startedAt time.Time
}

// New assembles the server from resolved config and dependencies.
func New(cfg *config.Config, orch *pipeline.Orchestrator, q *queue.Queue, lim *ratelimit.Limiter, proj *store.MemStore, reg *metrics.Registry) *Server {
	return &Server{
		cfg:       cfg,
		orch:      orch,
		queue:     q,
		limiter:   lim,
		proj:      proj,
		metrics:   reg,
		startedAt: time.Now(),
	}
}

// Routes builds the http.ServeMux with all endpoints and middleware applied.
func (s *Server) Routes() http.Handler {
	mux := http.NewServeMux()

	mux.HandleFunc("GET /healthz", s.handleHealth)
	mux.HandleFunc("GET /readyz", s.handleReady)
	mux.HandleFunc("GET /metrics", s.metrics.ServeHTTP)
	mux.HandleFunc("GET /v1/version", s.handleVersion)

	mux.HandleFunc("POST /v1/webhooks/ghl", s.handleGHLWebhook)
	mux.HandleFunc("GET /v1/events", s.handleEvents)
	mux.HandleFunc("POST /v1/replay", s.handleReplay)
	mux.HandleFunc("GET /v1/stats", s.handleStats)
	mux.HandleFunc("GET /v1/contacts", s.handleContacts)
	mux.HandleFunc("POST /v1/demo/fire", s.handleDemoFire)

	h := withRecovery(withRequestID(withCORS(s.cfg.AllowedOrigins, withAccessLog(s.metrics, mux))))
	return h
}

// SetReady flips the readiness gate (called after workers are started).
func (s *Server) SetReady(v bool) { s.ready.Store(v) }

// ────────────────────────────── handlers ──────────────────────────────

func (s *Server) handleHealth(w http.ResponseWriter, _ *http.Request) {
	httpx.WriteOK(w, http.StatusOK, map[string]any{
		"service":       version.Name,
		"version":       version.Version,
		"sha":           version.GitSHA,
		"uptimeSeconds": int(time.Since(s.startedAt).Seconds()),
	})
}

func (s *Server) handleReady(w http.ResponseWriter, _ *http.Request) {
	if !s.ready.Load() {
		httpx.WriteErr(w, http.StatusServiceUnavailable, "not_ready", "workers have not started")
		return
	}
	httpx.WriteOK(w, http.StatusOK, map[string]any{"ready": true})
}

func (s *Server) handleVersion(w http.ResponseWriter, _ *http.Request) {
	httpx.WriteOK(w, http.StatusOK, map[string]any{
		"name":    version.Name,
		"app":     version.App,
		"version": version.Version,
		"sha":     version.GitSHA,
	})
}

// handleGHLWebhook is the hot path. Body is read fully (bounded), signature
// verified over raw bytes, then handed to the orchestrator.
func (s *Server) handleGHLWebhook(w http.ResponseWriter, r *http.Request) {
	raw, err := readBoundedBody(r, 1<<20)
	if err != nil {
		httpx.WriteErr(w, http.StatusRequestEntityTooLarge, "body_too_large", err.Error())
		return
	}

	location := r.Header.Get("X-Location-Id")
	sig := firstNonEmpty(
		r.Header.Get("X-Webhook-Signature"),
		r.Header.Get("X-GHL-Signature"),
		r.Header.Get("X-RidgeLine-Signature"),
	)

	// Rate limiting is applied per location before the pipeline runs so
	// garbage traffic never reaches signature parsing (cheap-first rule).
	if location != "" {
		if s.limiter.Allow(location) == ratelimit.Deny {
			res := &pipeline.IngestResult{Status: eventlog.StatusRateLimited, Detail: "per-location rate limit"}
			s.orch.JournalRateLimited(location, sig != "")
			httpx.WriteOK(w, http.StatusTooManyRequests, res)
			return
		}
	}

	res, err := s.orch.Ingest(raw, sig, location)
	if err != nil {
		slog.Error("ingest infrastructure error", "err", err)
		httpx.WriteErr(w, http.StatusInternalServerError, "ingest_error", "internal ingest failure")
		return
	}

	// Explicit terminal HTTP status mapping per journal state.
	status := http.StatusOK
	switch res.Status {
	case eventlog.StatusBadSignature:
		status = http.StatusUnauthorized
	case eventlog.StatusInvalid:
		status = http.StatusUnprocessableEntity
	case eventlog.StatusRateLimited:
		status = http.StatusTooManyRequests
	}
	httpx.WriteOK(w, status, res)
}

func (s *Server) handleEvents(w http.ResponseWriter, r *http.Request) {
	n := clampInt(queryInt(r, "limit", 50), 1, 500)
	status := eventlog.Status(r.URL.Query().Get("status"))
	events := s.orch.Log.List(n, status)
	httpx.WriteOK(w, http.StatusOK, map[string]any{"count": len(events), "events": events})
}

func (s *Server) handleReplay(w http.ResponseWriter, r *http.Request) {
	limit := clampInt(queryInt(r, "limit", 100), 1, 1000)
	n, err := s.orch.Replay(limit)
	if err != nil {
		httpx.WriteErr(w, http.StatusInternalServerError, "replay_error", err.Error())
		return
	}
	httpx.WriteOK(w, http.StatusOK, map[string]any{"replayed": n})
}

func (s *Server) handleStats(w http.ResponseWriter, _ *http.Request) {
	contacts, uptime := s.proj.Contacts()
	limBuckets, limOK, limDenied, limEvicted := s.limiter.Stats()
	httpx.WriteOK(w, http.StatusOK, map[string]any{
		"service":     version.Name,
		"version":     version.Version,
		"sha":         version.GitSHA,
		"uptime":      uptime.String(),
		"ready":       s.ready.Load(),
		"journal":     s.orch.Log.Counts(),
		"queue":       s.queue.Stats(),
		"projection":  map[string]any{"contacts": contacts, "optedOut": s.proj.OptedOutCount()},
		"eventCounts": s.proj.EventCounts(),
		"rateLimiter": map[string]any{"buckets": limBuckets, "accepted": limOK, "denied": limDenied, "evicted": limEvicted},
		"metrics":     s.metrics.Snapshot(),
	})
}

func (s *Server) handleContacts(w http.ResponseWriter, r *http.Request) {
	n := clampInt(queryInt(r, "limit", 100), 1, 1000)
	httpx.WriteOK(w, http.StatusOK, map[string]any{"contacts": s.proj.List(n)})
}

// handleDemoFire lets the demo mode self-fire a correctly signed webhook so
// reviewers see the full pipeline without external tooling. Gated by DevMode.
func (s *Server) handleDemoFire(w http.ResponseWriter, r *http.Request) {
	if !s.cfg.DevMode {
		httpx.WriteErr(w, http.StatusForbidden, "demo_disabled", "enable ENGINE_DEV=true to use the demo self-fire")
		return
	}
	var body struct {
		Type       string `json:"type"`
		LocationID string `json:"locationId"`
		ContactID  string `json:"contactId"`
		Name       string `json:"name"`
		FormName   string `json:"formName"`
		Message    string `json:"message"`
	}
	if err := httpx.DecodeJSON(w, r, &body, 64<<10); err != nil {
		httpx.WriteErr(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	payload := map[string]any{
		"type":        body.Type,
		"locationId":  body.LocationID,
		"contactId":   body.ContactID,
		"contactName": body.Name,
	}
	if body.FormName != "" {
		payload["formName"] = body.FormName
		payload["formId"] = "demo-form"
	}
	if body.Message != "" {
		payload["messageBody"] = body.Message
		payload["messageId"] = fmt.Sprintf("demo-%d", time.Now().UnixNano())
	}
	// Scheduling demos get a realistic start time (+48h) so confirmations
	// and reminders are planned without extra input.
	if strings.Contains(strings.ToLower(body.Type), "appointment") {
		payload["startTime"] = time.Now().Add(48 * time.Hour).UTC().Format(time.RFC3339)
		payload["appointmentId"] = fmt.Sprintf("demo-appt-%d", time.Now().UnixNano())
		payload["appointmentStatus"] = "confirmed"
	}
	raw, _ := json.Marshal(payload)
	sig := ghl.Sign(s.cfg.WebhookSecret, raw)

	res, err := s.orch.Ingest(raw, sig, body.LocationID)
	if err != nil {
		httpx.WriteErr(w, http.StatusInternalServerError, "ingest_error", err.Error())
		return
	}
	httpx.WriteOK(w, http.StatusOK, map[string]any{"fired": true, "result": res})
}

// ────────────────────────────── helpers ──────────────────────────────

func readBoundedBody(r *http.Request, max int64) ([]byte, error) {
	if r.Body == nil {
		return nil, fmt.Errorf("empty body")
	}
	buf := make([]byte, 0, 4096)
	chunk := make([]byte, 4096)
	total := int64(0)
	for {
		n, err := r.Body.Read(chunk)
		if n > 0 {
			total += int64(n)
			if total > max {
				return nil, fmt.Errorf("body exceeds %d bytes", max)
			}
			buf = append(buf, chunk[:n]...)
		}
		if err != nil {
			if errors.Is(err, io.EOF) {
				return buf, nil
			}
			return nil, err
		}
	}
}

func queryInt(r *http.Request, key string, def int) int {
	v := r.URL.Query().Get(key)
	if v == "" {
		return def
	}
	n, err := strconv.Atoi(v)
	if err != nil {
		return def
	}
	return n
}

func clampInt(v, lo, hi int) int {
	if v < lo {
		return lo
	}
	if v > hi {
		return hi
	}
	return v
}

func firstNonEmpty(vals ...string) string {
	for _, v := range vals {
		if v != "" {
			return v
		}
	}
	return ""
}

// contextKey is the typed key for request-scoped values.
type contextKey string

const requestIDKey contextKey = "request_id"

// RequestIDFrom extracts the request id set by middleware.
func RequestIDFrom(ctx context.Context) string {
	if v, ok := ctx.Value(requestIDKey).(string); ok {
		return v
	}
	return ""
}
