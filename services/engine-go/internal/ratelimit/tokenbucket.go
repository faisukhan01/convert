// Package ratelimit implements a concurrent token-bucket limiter keyed by
// provider location id. It mirrors the demo limiter in src/lib/webhooks.ts
// but is production-shaped: refill from elapsed time, burst allowance and
// automatic eviction of idle buckets to keep memory flat under churn.
package ratelimit

import (
	"sync"
	"time"
)

// Limit is the decision returned by Allow.
type Limit int

const (
	// Allow means the event is admitted.
	Allow Limit = iota
	// Deny means the caller is rate limited this instant.
	Deny
)

// bucket is a single key's token state.
type bucket struct {
	tokens   float64
	capacity float64
	rate     float64 // tokens per second
	last     time.Time
}

// Limiter manages per-key token buckets with idle eviction.
type Limiter struct {
	mu       sync.Mutex
	buckets  map[string]*bucket
	rate     float64
	burst    float64
	idleTTL  time.Duration
	lastGC   time.Time
	nowFn    func() time.Time
	evicted  uint64
	accepted uint64
	denied   uint64
}

// New creates a Limiter admitting eventsPerMin per minute per key with a
// burst multiplier. Idle buckets are evicted after 10 minutes.
func New(eventsPerMin, burstMultiplier int) *Limiter {
	if eventsPerMin <= 0 {
		eventsPerMin = 300
	}
	if burstMultiplier < 1 {
		burstMultiplier = 1
	}
	return &Limiter{
		buckets: make(map[string]*bucket),
		rate:    float64(eventsPerMin) / 60.0,
		burst:   float64(eventsPerMin * burstMultiplier),
		idleTTL: 10 * time.Minute,
		lastGC:  time.Now(),
		nowFn:   time.Now,
	}
}

// Allow consumes one token for key, refilling pro-rata since last touch.
func (l *Limiter) Allow(key string) Limit {
	l.mu.Lock()
	defer l.mu.Unlock()
	now := l.nowFn()

	l.gcLocked(now)

	b, ok := l.buckets[key]
	if !ok {
		b = &bucket{tokens: l.burst, capacity: l.burst, rate: l.rate, last: now}
		l.buckets[key] = b
	}
	elapsed := now.Sub(b.last).Seconds()
	if elapsed > 0 {
		b.tokens = minFloat(b.capacity, b.tokens+elapsed*b.rate)
		b.last = now
	}
	if b.tokens >= 1 {
		b.tokens--
		l.accepted++
		return Allow
	}
	l.denied++
	return Deny
}

// Stats reports limiter counters for /v1/stats.
func (l *Limiter) Stats() (buckets int, accepted, denied, evicted uint64) {
	l.mu.Lock()
	defer l.mu.Unlock()
	return len(l.buckets), l.accepted, l.denied, l.evicted
}

// gcLocked evicts buckets idle beyond the TTL; runs at most once per minute.
func (l *Limiter) gcLocked(now time.Time) {
	if now.Sub(l.lastGC) < time.Minute {
		return
	}
	l.lastGC = now
	for k, b := range l.buckets {
		if now.Sub(b.last) > l.idleTTL {
			delete(l.buckets, k)
			l.evicted++
		}
	}
}

func minFloat(a, b float64) float64 {
	if a < b {
		return a
	}
	return b
}
