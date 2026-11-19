package server

import (
	"context"
	"log/slog"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/faisukhan01/convert/services/engine-go/internal/httpx"
	"github.com/faisukhan01/convert/services/engine-go/internal/metrics"
)

// middleware: request id → CORS → access log → panic recovery.
// Order matters: recovery wraps everything; logging wraps the router.

// withRequestID assigns a short unique id per request for log correlation.
func withRequestID(next http.Handler) http.Handler {
	var seq uint64
	var mu sync.Mutex
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		mu.Lock()
		seq++
		id := seq
		mu.Unlock()
		r = r.WithContext(withRequestIDValue(r.Context(), id))
		w.Header().Set("X-Request-Id", formatID(id))
		next.ServeHTTP(w, r)
	})
}

func formatID(n uint64) string {
	const hexdigits = "0123456789abcdef"
	if n == 0 {
		return "0"
	}
	var buf [16]byte
	i := len(buf)
	for n > 0 {
		i--
		buf[i] = hexdigits[n%16]
		n /= 16
	}
	return string(buf[i:])
}

func withRequestIDValue(ctx context.Context, id uint64) context.Context {
	return context.WithValue(ctx, requestIDKey, formatID(id))
}

// withCORS applies the configured origin allowlist; disallowed origins get
// no CORS headers (the browser enforces the block).
func withCORS(allowed []string, next http.Handler) http.Handler {
	allowSet := make(map[string]struct{}, len(allowed))
	for _, o := range allowed {
		allowSet[strings.TrimSpace(o)] = struct{}{}
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		if origin != "" {
			if _, ok := allowSet[origin]; ok || wildcard(allowSet) {
				w.Header().Set("Access-Control-Allow-Origin", origin)
				w.Header().Set("Vary", "Origin")
				w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
				w.Header().Set("Access-Control-Allow-Headers", "Content-Type, X-Webhook-Signature, X-GHL-Signature, X-Location-Id, X-Request-Id")
				w.Header().Set("Access-Control-Max-Age", "600")
			}
		}
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func wildcard(set map[string]struct{}) bool {
	_, ok := set["*"]
	return ok
}

// statusRecorder captures the status code for access logging.
type statusRecorder struct {
	http.ResponseWriter
	status int
	bytes  int
}

func (s *statusRecorder) WriteHeader(code int) {
	s.status = code
	s.ResponseWriter.WriteHeader(code)
}

func (s *statusRecorder) Write(b []byte) (int, error) {
	n, err := s.ResponseWriter.Write(b)
	s.bytes += n
	return n, err
}

// withAccessLog logs method, path, status, duration and bumps HTTP metrics.
func withAccessLog(reg *metrics.Registry, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		rec := &statusRecorder{ResponseWriter: w, status: http.StatusOK}
		next.ServeHTTP(rec, r)
		d := time.Since(start)
		route := routeLabel(r.URL.Path)
		reg.IncLabeled(metrics.CounterHTTPRequests, map[string]string{
			"route":  route,
			"status": strconv.Itoa(rec.status),
		})
		slog.Debug("http",
			"method", r.Method,
			"path", route,
			"status", rec.status,
			"bytes", rec.bytes,
			"duration", d.String(),
			"requestId", RequestIDFrom(r.Context()),
		)
	})
}

// routeLabel buckets dynamic paths so metric cardinality stays bounded.
func routeLabel(path string) string {
	known := []string{
		"/v1/webhooks/ghl", "/v1/events", "/v1/replay", "/v1/stats",
		"/v1/contacts", "/v1/version", "/v1/demo/fire",
		"/v1/rules", "/v1/score", "/v1/ai/", "/v1/ghl/", "/v1/store/",
		"/healthz", "/readyz", "/metrics",
	}
	for _, k := range known {
		if strings.HasPrefix(path, k) {
			return k
		}
	}
	return "other"
}

// withRecovery converts panics into 500 envelopes instead of dropped connections.
func withRecovery(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if rec := recover(); rec != nil {
				slog.Error("panic recovered", "path", r.URL.Path, "panic", rec)
				httpx.WriteErr(w, http.StatusInternalServerError, "panic", "internal server error")
			}
		}()
		next.ServeHTTP(w, r)
	})
}
