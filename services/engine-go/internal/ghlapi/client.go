package ghlapi

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"sync"
	"time"
)

// Error is a typed GHL API error. Callers switch on Retryable() to decide
// whether a retry is worthwhile and on StatusCode for control flow.
type Error struct {
	StatusCode int
	Method     string
	Path       string
	Body       string
	RetryAfter time.Duration
}

// Error implements the error interface with a compact, log-friendly string.
func (e *Error) Error() string {
	return fmt.Sprintf("ghlapi: %s %s -> %d: %s", e.Method, e.Path, e.StatusCode, truncate(e.Body, 240))
}

// Retryable reports whether the same request can succeed on a retry:
// 429 (rate limit), 408 (timeout), 5xx (server side) all qualify.
func (e *Error) Retryable() bool {
	switch e.StatusCode {
	case http.StatusTooManyRequests, http.StatusRequestTimeout:
		return true
	case http.StatusInternalServerError, http.StatusBadGateway,
		http.StatusServiceUnavailable, http.StatusGatewayTimeout:
		return true
	}
	return false
}

// IsNotFound reports whether the upstream object does not exist.
func IsNotFound(err error) bool {
	var apiErr *Error
	if errors.As(err, &apiErr) {
		return apiErr.StatusCode == http.StatusNotFound
	}
	return false
}

// IsRateLimited reports whether the call hit the provider rate limiter.
func IsRateLimited(err error) bool {
	var apiErr *Error
	if errors.As(err, &apiErr) {
		return apiErr.StatusCode == http.StatusTooManyRequests
	}
	return false
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "..."
}

// ───────────────────────── outbound limiter ─────────────────────────

// limiter is a provider-shaped token bucket: GHL allows roughly 10 req/s
// with headroom; exceeding it returns 429s we would rather never see.
type limiter struct {
	mu     sync.Mutex
	tokens float64
	max    float64
	rate   float64 // tokens per second
	last   time.Time
}

func newLimiter(perSecond float64, burst float64) *limiter {
	return &limiter{tokens: burst, max: burst, rate: perSecond, last: time.Now()}
}

// acquire blocks until a token is available or ctx is cancelled.
func (l *limiter) acquire(ctx context.Context) error {
	for {
		l.mu.Lock()
		now := time.Now()
		elapsed := now.Sub(l.last).Seconds()
		if elapsed > 0 {
			l.tokens = minf(l.max, l.tokens+elapsed*l.rate)
			l.last = now
		}
		if l.tokens >= 1 {
			l.tokens--
			l.mu.Unlock()
			return nil
		}
		// seconds until the next token accrues
		wait := time.Duration((1 - l.tokens) / l.rate * float64(time.Second))
		l.mu.Unlock()
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(wait):
		}
	}
}

func minf(a, b float64) float64 {
	if a < b {
		return a
	}
	return b
}

// ───────────────────────── client ─────────────────────────

// DefaultBaseURL is the production GoHighLevel API v2 endpoint.
const DefaultBaseURL = "https://services.leadconnectorhq.com"

// Version stamps the API-Version header GHL requires.
const Version = "2021-07-28"

// Client is the typed GoHighLevel API client.
type Client struct {
	base       string
	token      string
	locationID string
	http       *http.Client
	lim        *limiter
	maxRetries int
	baseDelay  time.Duration
	maxDelay   time.Duration
	timeout    time.Duration
	nowFn      func() time.Time
}

// Option configures optional Client behavior.
type Option func(*Client)

// WithBase overrides the API base URL (used by tests and proxies).
func WithBase(url string) Option {
	return func(c *Client) { c.base = url }
}

// WithHTTPClient injects a custom http.Client (proxies, transports).
func WithHTTPClient(h *http.Client) Option {
	return func(c *Client) { c.http = h }
}

// WithMaxRetries bounds retry attempts for retryable failures.
func WithMaxRetries(n int) Option {
	return func(c *Client) { c.maxRetries = n }
}

// WithTimeout bounds every individual attempt.
func WithTimeout(d time.Duration) Option {
	return func(c *Client) { c.timeout = d }
}

// WithLocationID pins the sub-account the client operates on.
func WithLocationID(id string) Option {
	return func(c *Client) { c.locationID = id }
}

// NewClient builds a Client from a Private Integration Token (PIT) or an
// OAuth access token. Tokens are never logged by this package.
func NewClient(token string, opts ...Option) *Client {
	c := &Client{
		base:       DefaultBaseURL,
		token:      token,
		http:       &http.Client{},
		lim:        newLimiter(9, 18), // stay just under GHL's documented ceiling
		maxRetries: 4,
		baseDelay:  400 * time.Millisecond,
		maxDelay:   8 * time.Second,
		timeout:    15 * time.Second,
		nowFn:      time.Now,
	}
	for _, opt := range opts {
		opt(c)
	}
	return c
}

// LocationID returns the pinned sub-account id (may be empty).
func (c *Client) LocationID() string { return c.locationID }

// Configured reports whether a token is present (never reveals it).
func (c *Client) Configured() bool { return c.token != "" }

// MaskedToken renders the token safe for logs and status endpoints.
func (c *Client) MaskedToken() string {
	if len(c.token) <= 6 {
		return "****"
	}
	return c.token[:6] + "****"
}

// do executes one API call with rate limiting, retries and typed errors.
// When out is nil the response body is discarded (mutation endpoints).
func (c *Client) do(ctx context.Context, method, path string, query map[string]string, body any, out any) error {
	var attempt int
	for {
		attempt++
		err := c.attempt(ctx, method, path, query, body, out)
		if err == nil {
			return nil
		}
		var apiErr *Error
		if !errors.As(err, &apiErr) || !apiErr.Retryable() || attempt > c.maxRetries {
			return err
		}
		delay := apiErr.RetryAfter
		if delay <= 0 {
			delay = backoff(c.baseDelay, c.maxDelay, attempt)
		}
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(delay):
		}
	}
}

// backoff computes exponential delay with a hard cap.
func backoff(base, max time.Duration, attempt int) time.Duration {
	d := base
	for i := 1; i < attempt && d < max; i++ {
		d *= 2
	}
	if d > max {
		d = max
	}
	return d
}

// attempt performs exactly one HTTP round trip.
func (c *Client) attempt(ctx context.Context, method, path string, query map[string]string, body any, out any) error {
	if err := c.lim.acquire(ctx); err != nil {
		return err
	}

	attemptCtx, cancel := context.WithTimeout(ctx, c.timeout)
	defer cancel()

	req, err := http.NewRequestWithContext(attemptCtx, method, c.base+path, encodeBody(body))
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+c.token)
	req.Header.Set("Version", Version)
	req.Header.Set("Accept", "application/json")
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	if len(query) > 0 {
		q := req.URL.Query()
		for k, v := range query {
			q.Set(k, v)
		}
		req.URL.RawQuery = q.Encode()
	}

	resp, err := c.http.Do(req)
	if err != nil {
		return &Error{Method: method, Path: path, StatusCode: http.StatusRequestTimeout, Body: err.Error()}
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 200 && resp.StatusCode < 300 {
		if out == nil || resp.StatusCode == http.StatusNoContent {
			return nil
		}
		return decodeJSON(resp, out)
	}

	apiErr := &Error{Method: method, Path: path, StatusCode: resp.StatusCode}
	apiErr.Body = readBodyString(resp)
	if resp.StatusCode == http.StatusTooManyRequests {
		if ra := resp.Header.Get("Retry-After"); ra != "" {
			if secs, err := strconv.Atoi(ra); err == nil {
				apiErr.RetryAfter = time.Duration(secs) * time.Second
			}
		}
	}
	return apiErr
}
