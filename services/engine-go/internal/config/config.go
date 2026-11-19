// Package config resolves engine configuration from the environment with
// production-sane defaults. Every knob is documented in docs/configuration-inventory.md
// and mirrored by the TypeScript side (src/lib/constants.ts) so both runtimes agree.
package config

import (
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"
)

// Config is the fully-resolved runtime configuration of the engine.
type Config struct {
	// ListenAddr is the host:port the HTTP server binds to.
	ListenAddr string
	// WebhookSecret is the shared HMAC-SHA256 secret used to verify inbound
	// provider (GoHighLevel) webhook signatures over the raw request body.
	WebhookSecret string
	// RequireSignature toggles HMAC enforcement. Demo environments may disable
	// it; production must never run with RequireSignature=false.
	RequireSignature bool
	// RateLimitEventsPerMin caps inbound webhook events per location per minute
	// (token bucket). Mirrors the demo limiter in src/lib/webhooks.ts.
	RateLimitEventsPerMin int
	// BurstMultiplier allows short spikes above the steady-state rate.
	BurstMultiplier int
	// WorkerCount is the number of pipeline workers draining the queue.
	WorkerCount int
	// QueueCapacity bounds the priority queue; overflow events are deferred
	// with an explicit state so the replay path can recover them.
	QueueCapacity int
	// MaxAttempts bounds per-job retries before the job lands in the dead state.
	MaxAttempts int
	// BaseBackoff is the exponential backoff seed: base * 2^attempt, capped.
	BaseBackoff time.Duration
	// MaxBackoff caps the exponential backoff window.
	MaxBackoff time.Duration
	// EventLogCapacity is the in-memory ring size for the durable event log.
	// Operators scale this to cover a replay window; a persistent sink
	// (Postgres) replaces the ring when the DB split is enabled.
	EventLogCapacity int
	// ShutdownGrace bounds drain time for workers and in-flight requests.
	ShutdownGrace time.Duration
	// ReadTimeout / WriteTimeout guard slow-loris style clients.
	ReadTimeout  time.Duration
	WriteTimeout time.Duration
	// AllowedOrigins is the CORS allowlist for browser clients (the Next.js app).
	AllowedOrigins []string
	// LogFormat is "text" or "json".
	LogFormat string
	// LogLevel is slog level: debug, info, warn, error.
	LogLevel string
	// DevMode enables verbose diagnostics; must be false in production.
	DevMode bool
}

// FromEnv builds a Config from the process environment.
func FromEnv() (*Config, error) {
	c := &Config{
		ListenAddr:            ":" + envStr("ENGINE_PORT", "8088"),
		WebhookSecret:         envStr("GHL_WEBHOOK_SECRET", "ridgeline-demo-webhook-secret"),
		RequireSignature:      envBool("ENGINE_REQUIRE_SIGNATURE", true),
		RateLimitEventsPerMin: envInt("ENGINE_RATE_LIMIT_PER_MIN", 300),
		BurstMultiplier:       envInt("ENGINE_BURST_MULTIPLIER", 2),
		WorkerCount:           envInt("ENGINE_WORKERS", 8),
		QueueCapacity:         envInt("ENGINE_QUEUE_CAPACITY", 4096),
		MaxAttempts:           envInt("ENGINE_MAX_ATTEMPTS", 5),
		BaseBackoff:           envDur("ENGINE_BASE_BACKOFF", 250*time.Millisecond),
		MaxBackoff:            envDur("ENGINE_MAX_BACKOFF", 30*time.Second),
		EventLogCapacity:      envInt("ENGINE_EVENT_LOG_CAPACITY", 10000),
		ShutdownGrace:         envDur("ENGINE_SHUTDOWN_GRACE", 15*time.Second),
		ReadTimeout:           envDur("ENGINE_READ_TIMEOUT", 10*time.Second),
		WriteTimeout:          envDur("ENGINE_WRITE_TIMEOUT", 15*time.Second),
		AllowedOrigins:        envList("ENGINE_ALLOWED_ORIGINS", "http://localhost:3000"),
		LogFormat:             strings.ToLower(envStr("ENGINE_LOG_FORMAT", "text")),
		LogLevel:              strings.ToLower(envStr("ENGINE_LOG_LEVEL", "info")),
		DevMode:               envBool("ENGINE_DEV", false),
	}
	if c.WorkerCount <= 0 || c.WorkerCount > 256 {
		return nil, fmt.Errorf("config: ENGINE_WORKERS must be in [1,256], got %d", c.WorkerCount)
	}
	if c.QueueCapacity < c.WorkerCount {
		return nil, fmt.Errorf("config: ENGINE_QUEUE_CAPACITY (%d) must be >= ENGINE_WORKERS (%d)", c.QueueCapacity, c.WorkerCount)
	}
	if c.RateLimitEventsPerMin <= 0 {
		return nil, fmt.Errorf("config: ENGINE_RATE_LIMIT_PER_MIN must be positive, got %d", c.RateLimitEventsPerMin)
	}
	if !c.RequireSignature && !c.DevMode {
		return nil, fmt.Errorf("config: refusing to start with ENGINE_REQUIRE_SIGNATURE=false outside ENGINE_DEV mode")
	}
	return c, nil
}

// GuardedSecret renders the secret for logs without leaking material.
func (c *Config) GuardedSecret() string {
	if c.WebhookSecret == "" {
		return "(empty)"
	}
	if c.DevMode {
		return c.WebhookSecret
	}
	const maxPrefix = 4
	if len(c.WebhookSecret) <= maxPrefix {
		return "****"
	}
	return c.WebhookSecret[:maxPrefix] + "****"
}

func envStr(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

func envBool(key string, def bool) bool {
	v := strings.ToLower(os.Getenv(key))
	switch v {
	case "1", "true", "yes", "on":
		return true
	case "0", "false", "no", "off":
		return false
	}
	return def
}

func envInt(key string, def int) int {
	if v := os.Getenv(key); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			return n
		}
	}
	return def
}

func envDur(key string, def time.Duration) time.Duration {
	if v := os.Getenv(key); v != "" {
		if d, err := time.ParseDuration(v); err == nil {
			return d
		}
	}
	return def
}

func envList(key, def string) []string {
	raw := envStr(key, def)
	parts := strings.Split(raw, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		if s := strings.TrimSpace(p); s != "" {
			out = append(out, s)
		}
	}
	return out
}
