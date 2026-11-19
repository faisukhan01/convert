// Package eventlog implements the durable event journal: an append-only,
// sequence-numbered ring buffer with explicit terminal states per event.
// Every inbound webhook lands here first (even invalid ones) so operators
// always have a replayable audit trail — the same contract the TypeScript
// ProviderEvent table fulfills on the app side.
package eventlog

import (
	"sync"
	"sync/atomic"
	"time"
)

// Status enumerates the explicit lifecycle states an event can land in.
// These strings match the ProviderEvent.status enum in the Prisma schema.
type Status string

const (
	StatusReceived     Status = "RECEIVED"     // logged, not yet processed
	StatusProcessed    Status = "PROCESSED"    // normalized + routed successfully
	StatusDuplicate    Status = "DUPLICATE"    // idempotency guard hit
	StatusRateLimited  Status = "RATE_LIMITED" // token bucket denied
	StatusBadSignature Status = "BAD_SIGNATURE"
	StatusInvalid      Status = "INVALID"      // structurally unusable payload
	StatusOutOfOrder   Status = "OUT_OF_ORDER" // ordering guard deferred it
	StatusFailed       Status = "FAILED"       // pipeline error after retries
	StatusReplayed     Status = "REPLAYED"     // recovered via replay path
)

// Terminal reports whether the state is final (no further transitions expected).
func (s Status) Terminal() bool {
	switch s {
	case StatusProcessed, StatusDuplicate, StatusRateLimited, StatusBadSignature, StatusInvalid, StatusFailed, StatusReplayed:
		return true
	}
	return false
}

// Event is one journal record.
type Event struct {
	Seq        uint64         `json:"seq"`
	ID         string         `json:"id"` // provider event id / dedupe key
	Type       string         `json:"type"`
	LocationID string         `json:"locationId"`
	Status     Status         `json:"status"`
	Detail     string         `json:"detail,omitempty"`
	Payload    map[string]any `json:"payload,omitempty"`
	Attempts   int            `json:"attempts"`
	ReceivedAt time.Time      `json:"receivedAt"`
	UpdatedAt  time.Time      `json:"updatedAt"`
}

// Log is the append-only ring journal.
type Log struct {
	mu       sync.RWMutex
	ring     []Event
	next     int
	count    int
	sequence atomic.Uint64
	byKey    map[string]uint64 // dedupe key → seq of first occurrence
}

// New creates a ring log with the given capacity (minimum 64).
func New(capacity int) *Log {
	if capacity < 64 {
		capacity = 64
	}
	return &Log{
		ring:  make([]Event, capacity),
		byKey: make(map[string]uint64),
	}
}

// Append journals a new event and returns its sequence number.
func (l *Log) Append(e *Event) uint64 {
	seq := l.sequence.Add(1)
	e.Seq = seq
	now := time.Now()
	e.ReceivedAt = now
	e.UpdatedAt = now

	l.mu.Lock()
	defer l.mu.Unlock()
	l.ring[l.next] = *e
	if e.ID != "" {
		l.byKey[e.ID] = seq
	}
	l.next = (l.next + 1) % len(l.ring)
	if l.count < len(l.ring) {
		l.count++
	}
	return seq
}

// Update transitions an event's status/detail in place by sequence number.
func (l *Log) Update(seq uint64, status Status, detail string) {
	l.mu.Lock()
	defer l.mu.Unlock()
	i, ok := l.indexOfLocked(seq)
	if !ok {
		return
	}
	l.ring[i].Status = status
	l.ring[i].Detail = detail
	l.ring[i].UpdatedAt = time.Now()
}

// BumpAttempts increments the retry counter for an event.
func (l *Log) BumpAttempts(seq uint64) int {
	l.mu.Lock()
	defer l.mu.Unlock()
	i, ok := l.indexOfLocked(seq)
	if !ok {
		return 0
	}
	l.ring[i].Attempts++
	l.ring[i].UpdatedAt = time.Now()
	return l.ring[i].Attempts
}

// Lookup finds an event by its dedupe key (first occurrence wins).
func (l *Log) Lookup(key string) (*Event, bool) {
	l.mu.RLock()
	defer l.mu.RUnlock()
	seq, ok := l.byKey[key]
	if !ok {
		return nil, false
	}
	i, ok := l.indexOfLocked(seq)
	if !ok {
		return nil, false
	}
	e := l.ring[i]
	return &e, true
}

// Get returns a copy of the event at seq.
func (l *Log) Get(seq uint64) (*Event, bool) {
	l.mu.RLock()
	defer l.mu.RUnlock()
	i, ok := l.indexOfLocked(seq)
	if !ok {
		return nil, false
	}
	e := l.ring[i]
	return &e, true
}

// List returns the most recent n events in descending sequence order,
// optionally filtered by status (empty = all).
func (l *Log) List(n int, status Status) []Event {
	l.mu.RLock()
	defer l.mu.RUnlock()
	out := make([]Event, 0, min(n, l.count))
	for i := 0; i < l.count && len(out) < n; i++ {
		idx := (l.next - 1 - i + 2*len(l.ring)) % len(l.ring)
		e := l.ring[idx]
		if status == "" || e.Status == status {
			out = append(out, e)
		}
	}
	return out
}

// Replayable returns events eligible for replay (FAILED, RATE_LIMITED, OUT_OF_ORDER).
func (l *Log) Replayable(limit int) []Event {
	l.mu.RLock()
	defer l.mu.RUnlock()
	out := make([]Event, 0, limit)
	for i := 0; i < l.count && len(out) < limit; i++ {
		idx := (l.next - 1 - i + 2*len(l.ring)) % len(l.ring)
		e := l.ring[idx]
		switch e.Status {
		case StatusFailed, StatusRateLimited, StatusOutOfOrder:
			out = append(out, e)
		}
	}
	return out
}

// Counts aggregates journal states for /v1/stats.
func (l *Log) Counts() map[string]int {
	l.mu.RLock()
	defer l.mu.RUnlock()
	counts := map[string]int{"capacity": len(l.ring), "size": l.count}
	for i := 0; i < l.count; i++ {
		idx := (l.next - 1 - i + 2*len(l.ring)) % len(l.ring)
		counts[string(l.ring[idx].Status)]++
	}
	return counts
}

// indexOfLocked converts a global sequence to a ring index; caller holds lock.
func (l *Log) indexOfLocked(seq uint64) (int, bool) {
	if l.count == 0 {
		return 0, false
	}
	oldest := l.sequence.Load() - uint64(l.count) + 1
	if seq < oldest || seq > l.sequence.Load() {
		return 0, false
	}
	return int((seq - 1) % uint64(len(l.ring))), true
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
