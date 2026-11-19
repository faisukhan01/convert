// Package scoring turns raw event history into a lead temperature. The
// scorer is deterministic and dependency-free so operators can reason about
// every point; the AI layer (internal/ai) may refine the verdict but never
// silently replaces the audit trail.
package scoring

import (
	"sync"
	"time"

	"github.com/faisukhan01/convert/services/engine-go/internal/pipeline"
)

// Bands are the temperature thresholds.
const (
	HotThreshold  = 80
	WarmThreshold = 45
)

// Band is the qualitative temperature bucket.
type Band string

const (
	BandHot  Band = "hot"
	BandWarm Band = "warm"
	BandCold Band = "cold"
)

// Weights assign points to canonical event types (tunable via Env or API).
type Weights struct {
	FormSubmitted      float64 // high intent
	SurveySubmitted    float64
	AppointmentCreated float64
	MessageInbound     float64
	OpportunityMoved   float64
	TagApplied         float64
	ContactCreated     float64
}

// DefaultWeights is the baseline scoring model.
var DefaultWeights = Weights{
	FormSubmitted:      30,
	SurveySubmitted:    26,
	AppointmentCreated: 34,
	MessageInbound:     18,
	OpportunityMoved:   24,
	TagApplied:         6,
	ContactCreated:     10,
}

// Result is one scoring computation with a full audit trail.
type Result struct {
	Score    int       `json:"score"`
	Band     Band      `json:"band"`
	Reasons  []string  `json:"reasons"`
	Signals  int       `json:"signals"` // contributing events
	LastSeen time.Time `json:"lastSeen"`
}

// entry is one recorded event for a contact.
type entry struct {
	typ   string
	value float64
	at    time.Time
}

// Tracker keeps a bounded per-contact event history for on-demand scoring.
// It is safe for concurrent use; each contact's history is capped so memory
// stays flat under churn.
type Tracker struct {
	mu      sync.RWMutex
	byKey   map[string][]entry
	cap     int
	ttl     time.Duration
	weights Weights
	nowFn   func() time.Time
}

// NewTracker builds a tracker with the default weights and a 64-entry
// per-contact history capped by a 30-day TTL.
func NewTracker() *Tracker {
	return &Tracker{
		byKey:   make(map[string][]entry, 64),
		cap:     64,
		ttl:     30 * 24 * time.Hour,
		weights: DefaultWeights,
		nowFn:   time.Now,
	}
}

// key normalizes the composite contact key.
func key(locationID, contactID string) string {
	return locationID + "|" + contactID
}

// Record folds one canonical event into the contact history.
func (t *Tracker) Record(c *pipeline.Canonical) {
	if c == nil || c.LocationID == "" {
		return
	}
	id := c.ContactID
	if id == "" {
		id = c.Contact.Name
	}
	if id == "" {
		return
	}
	at := c.ObservedAt
	if at.IsZero() {
		at = t.nowFn()
	}
	var value float64
	if c.Opportunity != nil {
		value = c.Opportunity.Value
	}

	t.mu.Lock()
	defer t.mu.Unlock()
	k := key(c.LocationID, id)
	hist := append(t.byKey[k], entry{typ: c.Type, value: value, at: at})
	if len(hist) > t.cap {
		hist = hist[len(hist)-t.cap:]
	}
	t.byKey[k] = hist
	t.pruneLocked(k, at)
}

// pruneLocked drops entries older than the TTL. Caller holds the lock.
func (t *Tracker) pruneLocked(k string, now time.Time) {
	hist := t.byKey[k]
	kept := hist[:0]
	for _, e := range hist {
		if now.Sub(e.at) <= t.ttl {
			kept = append(kept, e)
		}
	}
	t.byKey[k] = kept
}

// Score computes the current temperature for a contact. Empty history
// yields a zero-score cold result (still fully auditable).
func (t *Tracker) Score(locationID, contactID string) Result {
	t.mu.RLock()
	hist := append([]entry(nil), t.byKey[key(locationID, contactID)]...)
	t.mu.RUnlock()
	return Compute(hist, t.nowFn())
}

// Compute is the pure scoring function: points from event types, decayed by
// recency, amplified by deal value, capped at 100.
func Compute(hist []entry, now time.Time) Result {
	res := Result{Band: BandCold, LastSeen: time.Time{}}
	if len(hist) == 0 {
		return res
	}

	raw := 0.0
	for _, e := range hist {
		w := weightFor(e.typ)
		if w <= 0 {
			continue
		}
		// Linear recency decay over 30 days: today's events are worth 100%,
		// month-old events ~10%.
		ageDays := now.Sub(e.at).Hours() / 24
		if ageDays < 0 {
			ageDays = 0
		}
		decay := 1.0 - ageDays/33.0
		if decay < 0.1 {
			decay = 0.1
		}
		gain := w * decay
		// High-value opportunities nudge the score up (up to +8).
		if e.value > 0 {
			bonus := e.value / 12500.0
			if bonus > 8 {
				bonus = 8
			}
			gain += bonus
		}
		raw += gain
		res.Signals++
		if e.at.After(res.LastSeen) {
			res.LastSeen = e.at
		}
	}

	res.Score = int(raw)
	if res.Score > 100 {
		res.Score = 100
	}
	if res.Score < 0 {
		res.Score = 0
	}
	switch {
	case res.Score >= HotThreshold:
		res.Band = BandHot
	case res.Score >= WarmThreshold:
		res.Band = BandWarm
	default:
		res.Band = BandCold
	}
	res.Reasons = reasons(hist, now)
	return res
}

// weightFor maps canonical types to weights.
func weightFor(typ string) float64 {
	switch typ {
	case pipeline.EventTypeFormSubmitted:
		return DefaultWeights.FormSubmitted
	case pipeline.EventTypeSurveySubmitted:
		return DefaultWeights.SurveySubmitted
	case pipeline.EventTypeAppointmentCreated:
		return DefaultWeights.AppointmentCreated
	case pipeline.EventTypeMessageInbound:
		return DefaultWeights.MessageInbound
	case pipeline.EventTypeOpportunityMoved:
		return DefaultWeights.OpportunityMoved
	case pipeline.EventTypeTagApplied:
		return DefaultWeights.TagApplied
	case pipeline.EventTypeContactCreated:
		return DefaultWeights.ContactCreated
	default:
		return 0
	}
}

// reasons produces a human-readable audit trail of the biggest signals.
func reasons(hist []entry, now time.Time) []string {
	type sig struct {
		text string
		gain float64
	}
	sigs := make([]sig, 0, len(hist))
	for _, e := range hist {
		w := weightFor(e.typ)
		if w <= 0 {
			continue
		}
		age := now.Sub(e.at)
		sigs = append(sigs, sig{
			text: labelFor(e.typ, e.value, age),
			gain: w,
		})
	}
	// Sort by weight descending, keep top 4.
	for i := 1; i < len(sigs); i++ {
		for j := i; j > 0 && sigs[j].gain > sigs[j-1].gain; j-- {
			sigs[j], sigs[j-1] = sigs[j-1], sigs[j]
		}
	}
	if len(sigs) > 4 {
		sigs = sigs[:4]
	}
	out := make([]string, 0, len(sigs))
	for _, s := range sigs {
		out = append(out, s.text)
	}
	return out
}

func labelFor(typ string, value float64, age time.Duration) string {
	days := int(age.Hours() / 24)
	ageTxt := "today"
	if days == 1 {
		ageTxt = "yesterday"
	} else if days > 1 {
		ageTxt = itoa(days) + "d ago"
	}
	base := "event: " + typ
	switch typ {
	case pipeline.EventTypeOpportunityMoved:
		if value > 0 {
			base = "pipeline move worth $" + itoa(int(value))
		}
	case pipeline.EventTypeFormSubmitted:
		base = "form submitted (strong intent)"
	case pipeline.EventTypeAppointmentCreated:
		base = "appointment booked"
	case pipeline.EventTypeMessageInbound:
		base = "inbound message (engaged)"
	}
	return base + " (" + ageTxt + ")"
}

func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	var buf [12]byte
	i := len(buf)
	for n > 0 {
		i--
		buf[i] = byte('0' + n%10)
		n /= 10
	}
	return string(buf[i:])
}
