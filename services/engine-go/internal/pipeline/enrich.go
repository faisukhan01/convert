package pipeline

import (
	"strings"
	"time"

	"github.com/faisukhan01/convert/services/engine-go/internal/webhook/ghl"
)

// Canonical event type aliases. The rest of the engine (scoring, rules,
// handlers) references these names instead of reaching into the webhook
// package, keeping the canonical vocabulary the engine's public contract.
const (
	EventTypeContactCreated     = ghl.EventContactCreated
	EventTypeContactUpdated     = ghl.EventContactUpdated
	EventTypeFormSubmitted      = ghl.EventFormSubmitted
	EventTypeSurveySubmitted    = ghl.EventSurveySubmitted
	EventTypeAppointmentCreated = ghl.EventAppointmentCreated
	EventTypeAppointmentChanged = ghl.EventAppointmentChanged
	EventTypeAppointmentNoShow  = ghl.EventAppointmentNoShow
	EventTypeMessageInbound     = ghl.EventMessageInbound
	EventTypeMessageDropped     = ghl.EventMessageDropped
	EventTypeTagApplied         = ghl.EventTagApplied
	EventTypeOpportunityMoved   = ghl.EventOpportunityMoved
	EventTypeUnknown            = ghl.EventUnknown
)

// Enrich normalizes identity fields and lifts strong signals into the
// Custom map so rules and scoring can match without re-parsing payloads.
// It mutates the canonical event in place and is idempotent.
func Enrich(c *Canonical) {
	if c == nil {
		return
	}
	c.Contact.Email = normalizeEmail(c.Contact.Email)
	c.Contact.Phone = normalizePhone(c.Contact.Phone)
	c.Contact.Name = strings.TrimSpace(c.Contact.Name)
	c.Contact.ID = strings.TrimSpace(c.ContactID)

	if c.Custom == nil {
		c.Custom = map[string]any{}
	}
	if svc := inferService(c); svc != "" {
		if _, exists := c.Custom["service"]; !exists {
			c.Custom["service"] = svc
		}
	}
	if c.Message != nil && c.Message.Body != "" {
		if _, exists := c.Custom["intentHint"]; !exists {
			c.Custom["intentHint"] = intentHint(c.Message.Body)
		}
	}
	if c.Opportunity != nil && c.Opportunity.Value > 0 {
		if _, exists := c.Custom["dealValue"]; !exists {
			c.Custom["dealValue"] = c.Opportunity.Value
		}
	}
	if c.ObservedAt.IsZero() {
		c.ObservedAt = time.Now()
	}
}

// normalizeEmail lowercases and trims; empty stays empty.
func normalizeEmail(e string) string {
	return strings.ToLower(strings.TrimSpace(e))
}

// normalizePhone keeps digits and a leading plus, stripping formatting noise.
func normalizePhone(p string) string {
	p = strings.TrimSpace(p)
	var b strings.Builder
	for _, r := range p {
		if (r >= '0' && r <= '9') || r == '+' {
			b.WriteRune(r)
		}
	}
	out := b.String()
	// 10-digit US numbers get the +1 prefix for provider friendliness.
	if len(out) == 10 && !strings.HasPrefix(out, "+") {
		out = "+1" + out
	}
	return out
}

// inferService reuses the form/service classification across all event types.
func inferService(c *Canonical) string {
	if c.Form != nil && len(c.Form.Answers) > 0 {
		joined := ""
		for _, k := range SortedKeys(c.Form.Answers) {
			joined += " " + strings.ToLower(c.Form.Answers[k])
		}
		switch {
		case containsAny(joined, "replace", "new roof", "full roof", "re-roof"):
			return "replacement"
		case containsAny(joined, "inspect", "leak"):
			return "inspection"
		default:
			return "repair"
		}
	}
	if c.Message != nil {
		lower := strings.ToLower(c.Message.Body)
		switch {
		case containsAny(lower, "replace", "new roof"):
			return "replacement"
		case containsAny(lower, "leak", "fix", "repair"):
			return "repair"
		}
	}
	return ""
}

// intentHint buckets free text into a routing hint (stop wins first).
func intentHint(body string) string {
	lower := strings.ToLower(body)
	switch {
	case containsAny(lower, "stop", "unsubscribe", "opt out", "remove me", "do not text"):
		return "stop"
	case containsAny(lower, "reschedul", "move my", "change my"):
		return "reschedule"
	case containsAny(lower, "confirm", "see you", "sounds good"):
		return "confirm"
	case containsAny(lower, "quote", "price", "estimate", "cost"):
		return "quote"
	default:
		return "general"
	}
}
