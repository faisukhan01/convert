// Package ai is the engine's LLM brain, backed by z.ai chat completions
// (OpenAI-compatible wire format). It gives the automation pipeline two
// superpowers beyond rules: lead qualification (scoring + intent + urgency)
// and human-grade reply drafting — both with deterministic fallbacks so the
// engine keeps working when the model is unavailable.
package ai

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

// DefaultBaseURL is the z.ai OpenAI-compatible endpoint.
const DefaultBaseURL = "https://api.z.ai/api/paas/v4"

// DefaultModel is the fast tier model used for qualification and replies.
const DefaultModel = "glm-4-flash"

// Client talks to z.ai chat completions.
type Client struct {
	base       string
	key        string
	model      string
	http       *http.Client
	maxRetries int
	nowFn      func() time.Time
}

// Option configures the client.
type Option func(*Client)

// WithModel overrides the model id (e.g. glm-4-plus).
func WithModel(m string) Option {
	return func(c *Client) { c.model = m }
}

// WithBase overrides the API base URL.
func WithBase(u string) Option {
	return func(c *Client) { c.base = u }
}

// WithTimeout bounds a single completion call.
func WithTimeout(d time.Duration) Option {
	return func(c *Client) {
		c.http = &http.Client{Timeout: d}
	}
}

// NewClient builds a z.ai client. Empty keys are allowed: HasKey() reports
// availability and callers fall back to deterministic behavior.
func NewClient(key string, opts ...Option) *Client {
	c := &Client{
		base:       DefaultBaseURL,
		key:        key,
		model:      DefaultModel,
		http:       &http.Client{Timeout: 30 * time.Second},
		maxRetries: 2,
		nowFn:      time.Now,
	}
	for _, o := range opts {
		o(c)
	}
	return c
}

// HasKey reports whether real model calls are possible.
func (c *Client) HasKey() bool { return c.key != "" }

// Model returns the active model id.
func (c *Client) Model() string { return c.model }

// MaskedKey renders the key safe for logs/status endpoints.
func (c *Client) MaskedKey() string {
	if len(c.key) <= 6 {
		return "****"
	}
	return c.key[:6] + "****"
}

// ───────────────────────── wire types ─────────────────────────

// Message is one chat turn.
type Message struct {
	Role    string `json:"role"` // system | user | assistant
	Content string `json:"content"`
}

// chatRequest is the OpenAI-compatible completion request.
type chatRequest struct {
	Model       string    `json:"model"`
	Messages    []Message `json:"messages"`
	Temperature float64   `json:"temperature,omitempty"`
	MaxTokens   int       `json:"max_tokens,omitempty"`
	Stream      bool      `json:"stream"`
}

// ChatChoice is one completion alternative.
type ChatChoice struct {
	Index        int      `json:"index"`
	FinishReason string   `json:"finish_reason"`
	Message      *Message `json:"message"`
}

// chatResponse is the OpenAI-compatible completion response.
type chatResponse struct {
	ID      string       `json:"id"`
	Model   string       `json:"model"`
	Choices []ChatChoice `json:"choices"`
	Usage   struct {
		PromptTokens     int `json:"prompt_tokens"`
		CompletionTokens int `json:"completion_tokens"`
		TotalTokens      int `json:"total_tokens"`
	} `json:"usage"`
}

// ChatResult is what callers of Chat receive.
type ChatResult struct {
	Text         string
	FinishReason string
	TokensUsed   int
	Model        string
	Latency      time.Duration
}

// Chat performs one completion. It is the raw escape hatch; the semantic
// helpers (QualifyLead, DraftReply) build on this.
func (c *Client) Chat(ctx context.Context, system, user string, temperature float64, maxTokens int) (*ChatResult, error) {
	if !c.HasKey() {
		return nil, errors.New("ai: no API key configured")
	}
	req := chatRequest{
		Model:       c.model,
		Messages:    []Message{{Role: "system", Content: system}, {Role: "user", Content: user}},
		Temperature: temperature,
		MaxTokens:   maxTokens,
		Stream:      false,
	}

	var lastErr error
	for attempt := 0; attempt <= c.maxRetries; attempt++ {
		if attempt > 0 {
			select {
			case <-ctx.Done():
				return nil, ctx.Err()
			case <-time.After(backoffAI(attempt)):
			}
		}
		res, err := c.once(ctx, &req)
		if err == nil {
			return res, nil
		}
		lastErr = err
		var retriable *retryableError
		if !errors.As(err, &retriable) {
			return nil, err
		}
	}
	return nil, fmt.Errorf("ai: exhausted retries: %w", lastErr)
}

// retryableError marks transient upstream failures (429/5xx/network).
type retryableError struct{ err error }

func (r *retryableError) Error() string { return r.err.Error() }
func (r *retryableError) Unwrap() error { return r.err }

func backoffAI(attempt int) time.Duration {
	d := 500 * time.Millisecond
	for i := 1; i < attempt; i++ {
		d *= 2
	}
	if d > 4*time.Second {
		d = 4 * time.Second
	}
	return d
}

// once performs exactly one HTTP round trip.
func (c *Client) once(ctx context.Context, req *chatRequest) (*ChatResult, error) {
	body, err := json.Marshal(req)
	if err != nil {
		return nil, err
	}
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, c.base+"/chat/completions", bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	httpReq.Header.Set("Authorization", "Bearer "+c.key)
	httpReq.Header.Set("Content-Type", "application/json")

	start := c.nowFn()
	resp, err := c.http.Do(httpReq)
	if err != nil {
		return nil, &retryableError{err}
	}
	defer resp.Body.Close()

	raw, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return nil, &retryableError{err}
	}

	switch {
	case resp.StatusCode == http.StatusTooManyRequests,
		resp.StatusCode >= 500:
		return nil, &retryableError{fmt.Errorf("ai: upstream %d: %s", resp.StatusCode, truncateAI(raw, 200))}
	case resp.StatusCode == http.StatusUnauthorized || resp.StatusCode == http.StatusForbidden:
		return nil, fmt.Errorf("ai: auth rejected (%d) — check ZAI_API_KEY", resp.StatusCode)
	case resp.StatusCode < 200 || resp.StatusCode >= 300:
		return nil, fmt.Errorf("ai: unexpected status %d: %s", resp.StatusCode, truncateAI(raw, 200))
	}

	var out chatResponse
	if err := json.Unmarshal(raw, &out); err != nil {
		return nil, fmt.Errorf("ai: decode response: %w", err)
	}
	if len(out.Choices) == 0 || out.Choices[0].Message == nil {
		return nil, fmt.Errorf("ai: empty completion")
	}

	return &ChatResult{
		Text:         out.Choices[0].Message.Content,
		FinishReason: out.Choices[0].FinishReason,
		TokensUsed:   out.Usage.TotalTokens,
		Model:        out.Model,
		Latency:      c.nowFn().Sub(start),
	}, nil
}

func truncateAI(b []byte, n int) string {
	s := string(b)
	if len(s) <= n {
		return s
	}
	return s[:n] + "..."
}

// extractJSON pulls the first JSON object out of a model response that may
// contain prose or markdown fences around the object.
func extractJSON(text string) ([]byte, bool) {
	start := strings.Index(text, "{")
	if start < 0 {
		return nil, false
	}
	// Walk to the matching closing brace.
	depth := 0
	inStr := false
	esc := false
	for i := start; i < len(text); i++ {
		ch := text[i]
		if inStr {
			switch {
			case esc:
				esc = false
			case ch == '\\':
				esc = true
			case ch == '"':
				inStr = false
			}
			continue
		}
		switch ch {
		case '"':
			inStr = true
		case '{':
			depth++
		case '}':
			depth--
			if depth == 0 {
				return []byte(text[start : i+1]), true
			}
		}
	}
	return nil, false
}
