// Package httpx centralizes JSON response writing and API error shaping so
// every handler returns consistent envelopes that the TypeScript client
// (src/lib/api.ts) can parse without branching.
package httpx

import (
	"encoding/json"
	"net/http"
)

// Envelope is the canonical API response shape.
type Envelope struct {
	OK    bool   `json:"ok"`
	Data  any    `json:"data,omitempty"`
	Error *Error `json:"error,omitempty"`
}

// Error carries a machine-readable code plus human detail.
type Error struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

// WriteOK emits a 200 (or custom status) envelope with data.
func WriteOK(w http.ResponseWriter, status int, data any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(Envelope{OK: true, Data: data})
}

// WriteErr emits a structured error envelope.
func WriteErr(w http.ResponseWriter, status int, code, message string) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(Envelope{OK: false, Error: &Error{Code: code, Message: message}})
}

// DecodeJSON strictly decodes a JSON request body into dst with a size guard.
func DecodeJSON(w http.ResponseWriter, r *http.Request, dst any, maxBytes int64) error {
	if maxBytes <= 0 {
		maxBytes = 1 << 20 // 1 MiB default
	}
	r.Body = http.MaxBytesReader(w, r.Body, maxBytes)
	dec := json.NewDecoder(r.Body)
	dec.DisallowUnknownFields()
	return dec.Decode(dst)
}
