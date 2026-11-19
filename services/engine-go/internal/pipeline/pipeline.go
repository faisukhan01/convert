package pipeline

import (
	"encoding/json"
	"fmt"
	"log/slog"
	"sync"
	"time"

	"github.com/faisukhan01/convert/services/engine-go/internal/eventlog"
	"github.com/faisukhan01/convert/services/engine-go/internal/metrics"
	"github.com/faisukhan01/convert/services/engine-go/internal/queue"
	"github.com/faisukhan01/convert/services/engine-go/internal/webhook/ghl"
)

// Orchestrator wires the full ingest path:
//
//	raw bytes → signature → rate limit → parse → journal → dedupe
//	          → normalize → order → plan actions → enqueue
//
// Every branch ends in an explicit journal state so nothing is silently
// dropped and everything is replayable.
type Orchestrator struct {
	Log        *eventlog.Log
	Queue      *queue.Queue
	VerifyFn   func(secret string, raw []byte, header string) error
	Secret     string
	RequireSig bool
	metrics    *metrics.Registry

	orderMu    sync.Mutex
	lastPerKey map[string]time.Time // ordering guard per OrderingKey

	nowFn func() time.Time
}

// NewOrchestrator constructs the ingest pipeline.
func NewOrchestrator(l *eventlog.Log, q *queue.Queue, m *metrics.Registry) *Orchestrator {
	return &Orchestrator{
		Log:        l,
		Queue:      q,
		VerifyFn:   ghl.VerifySignature,
		metrics:    m,
		lastPerKey: make(map[string]time.Time),
		nowFn:      time.Now,
	}
}

// IngestResult reports what happened to a single webhook delivery.
type IngestResult struct {
	Status  eventlog.Status `json:"status"`
	Seq     uint64          `json:"seq"`
	Detail  string          `json:"detail,omitempty"`
	Planned int             `json:"plannedActions,omitempty"`
}

// Ingest runs one delivery through the pipeline. It never panics and never
// returns an error for business-level outcomes — those are statuses; only
// infrastructure surprises surface as errors.
func (o *Orchestrator) Ingest(raw []byte, signatureHeader, locationHint string) (*IngestResult, error) {
	o.metrics.Inc(metrics.CounterIngestTotal)

	// 1. Signature verification over the exact raw bytes.
	if o.RequireSig {
		if err := o.VerifyFn(o.Secret, raw, signatureHeader); err != nil {
			o.metrics.Inc(metrics.CounterSigFailures)
			seq := o.journalRaw(raw, locationHint, eventlog.StatusBadSignature, err.Error())
			return &IngestResult{Status: eventlog.StatusBadSignature, Seq: seq, Detail: err.Error()}, nil
		}
	}

	// 2. Parse (forward compatible: unknown fields tolerated upstream).
	var p ghl.Payload
	if err := json.Unmarshal(raw, &p); err != nil {
		o.metrics.Inc(metrics.CounterInvalidTotal)
		seq := o.journalRaw(raw, locationHint, eventlog.StatusInvalid, "unparseable json: "+err.Error())
		return &IngestResult{Status: eventlog.StatusInvalid, Seq: seq, Detail: "unparseable json"}, nil
	}
	if p.LocationID == "" {
		p.LocationID = locationHint
	}
	if !p.IsMeaningful() {
		o.metrics.Inc(metrics.CounterInvalidTotal)
		seq := o.journal(raw, eventlog.StatusInvalid, "payload lacks identity (no contact/message/appointment/form/opportunity)", &p, nil)
		return &IngestResult{Status: eventlog.StatusInvalid, Seq: seq, Detail: "payload lacks identity"}, nil
	}

	// 3. Idempotency: identical redelivery collapses onto the first event.
	dedupeKey := DedupeKey(&p)
	if prev, ok := o.Log.Lookup(dedupeKey); ok && prev.Status == eventlog.StatusProcessed {
		o.metrics.Inc(metrics.CounterDuplicates)
		o.Log.Update(prev.Seq, eventlog.StatusDuplicate, "redelivery of processed event")
		return &IngestResult{Status: eventlog.StatusDuplicate, Seq: prev.Seq, Detail: "duplicate delivery"}, nil
	}

	// 4. Journal the accepted delivery.
	seq := o.journal(raw, eventlog.StatusReceived, "", &p, nil)

	// 5. Normalize to canonical form.
	canon := Normalize(&p)

	// 6. Ordering guard: defer stream-relevant events that arrive out of order.
	if ok := o.checkOrder(canon, dedupeKey); !ok {
		o.Log.Update(seq, eventlog.StatusOutOfOrder, "older than last observed for stream")
		o.metrics.Inc(metrics.CounterOutOfOrder)
		return &IngestResult{Status: eventlog.StatusOutOfOrder, Seq: seq, Detail: "deferred by ordering guard"}, nil
	}

	// 7. Plan actions from the canonical event.
	actions := Plan(canon, o.nowFn())

	// 8. Enqueue with backpressure: bounded queue, explicit deferred state.
	enqueued := 0
	var overflow []string
	for _, a := range actions {
		if err := o.Queue.Enqueue(a); err != nil {
			overflow = append(overflow, string(a.Kind))
			continue
		}
		enqueued++
	}
	if len(overflow) > 0 {
		o.Log.Update(seq, eventlog.StatusOutOfOrder, fmt.Sprintf("queue full; deferred actions: %v", overflow))
		o.metrics.Inc(metrics.CounterQueueOverflow)
		return &IngestResult{Status: eventlog.StatusOutOfOrder, Seq: seq, Detail: "queue backpressure", Planned: enqueued}, nil
	}

	// 9. Terminal success.
	detail := ""
	if enqueued > 0 {
		detail = fmt.Sprintf("planned %d action(s)", enqueued)
	} else {
		detail = "no actions applicable"
	}
	o.Log.Update(seq, eventlog.StatusProcessed, detail)
	o.metrics.Inc(metrics.CounterProcessed)
	return &IngestResult{Status: eventlog.StatusProcessed, Seq: seq, Detail: detail, Planned: enqueued}, nil
}

// JournalRateLimited records a delivery rejected by the outer rate limiter
// so the audit trail shows every attempt, including ones that never reached
// signature parsing (cheap-first rule).
func (o *Orchestrator) JournalRateLimited(locationID string, signed bool) {
	id := fmt.Sprintf("rl:%s:%d", locationID, o.nowFn().UnixNano())
	o.Log.Append(&eventlog.Event{
		ID:         id,
		Type:       "webhook.delivery",
		LocationID: locationID,
		Status:     eventlog.StatusRateLimited,
		Detail:     "rejected by per-location token bucket (signed=" + fmt.Sprintf("%t", signed) + ")",
	})
	o.metrics.Inc(metrics.CounterRateLimited)
}

// Replay re-drives events stuck in non-terminal recoverable states.
func (o *Orchestrator) Replay(limit int) (int, error) {
	events := o.Log.Replayable(limit)
	replayed := 0
	for _, ev := range events {
		var p ghl.Payload
		if err := json.Unmarshal(mustJSON(ev.Payload), &p); err != nil {
			o.Log.Update(ev.Seq, eventlog.StatusFailed, "replay: payload no longer parseable")
			continue
		}
		canon := Normalize(&p)
		for _, a := range Plan(canon, o.nowFn()) {
			if err := o.Queue.Enqueue(a); err == nil {
				replayed++
			}
		}
		o.Log.Update(ev.Seq, eventlog.StatusReplayed, "replayed; actions re-enqueued")
		o.metrics.Inc(metrics.CounterReplays)
	}
	return replayed, nil
}

// checkOrder applies the ordering guard for streams that require sequence.
// Returns true when the event may proceed.
func (o *Orchestrator) checkOrder(c *Canonical, dedupeKey string) bool {
	key := OrderingKey(c)
	if key == "" {
		return true
	}
	o.orderMu.Lock()
	defer o.orderMu.Unlock()
	last, seen := o.lastPerKey[key]
	if !seen || !c.ObservedAt.Before(last) {
		o.lastPerKey[key] = c.ObservedAt
		return true
	}
	return false
}

func (o *Orchestrator) journalRaw(raw []byte, locationHint string, status eventlog.Status, detail string) uint64 {
	seq := o.Log.Append(&eventlog.Event{
		ID:         fmt.Sprintf("raw:%d", o.nowFn().UnixNano()),
		Type:       "webhook.delivery",
		LocationID: locationHint,
		Status:     status,
		Detail:     detail,
	})
	slog.Debug("ingest rejected", "status", status, "detail", detail)
	return seq
}

func (o *Orchestrator) journal(raw []byte, status eventlog.Status, detail string, p *ghl.Payload, _ *Canonical) uint64 {
	key := ""
	typ := "webhook.delivery"
	loc := ""
	if p != nil {
		key = DedupeKey(p)
		typ = Classify(p.Type)
		loc = p.LocationID
	}
	var payload map[string]any
	_ = json.Unmarshal(raw, &payload)
	return o.Log.Append(&eventlog.Event{
		ID:         key,
		Type:       typ,
		LocationID: loc,
		Status:     status,
		Detail:     detail,
		Payload:    payload,
	})
}

// mustJSON converts the journaled payload map back to bytes for replay.
func mustJSON(m map[string]any) []byte {
	if m == nil {
		return []byte("{}")
	}
	b, err := json.Marshal(m)
	if err != nil {
		return []byte("{}")
	}
	return b
}
