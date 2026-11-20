package pipeline

import (
	"fmt"
	"strings"
	"time"

	"github.com/faisukhan01/convert/services/engine-go/internal/action"
	"github.com/faisukhan01/convert/services/engine-go/internal/webhook/ghl"
)

// Plan derives automation intents from a canonical event. Planning is a pure
// function: the queue workers re-validate eligibility before any real send
// (the "stop rule wins the race" contract from src/lib/engine.ts).
func Plan(c *Canonical, now time.Time) []action.Action {
	if c == nil {
		return nil
	}
	var acts []action.Action
	key := func(suffix string) string {
		return fmt.Sprintf("%s:%s:%s", c.LocationID, c.Type, firstNonEmpty(c.ContactID, suffix))
	}
	contactID := func() string {
		if c.ContactID != "" {
			return c.ContactID
		}
		return c.Contact.Name // demo fallback until the app resolves identity
	}()

	confirm := func(kind string, at time.Time, reason string, extra ...map[string]string) action.Action {
		a := action.Action{
			Kind:       kind,
			LocationID: c.LocationID,
			ContactID:  contactID,
			DedupeKey:  key(kind),
			RunAt:      at,
			Priority:   action.PriorityUrgent,
			Reason:     reason,
		}
		if len(extra) > 0 {
			a.Payload = extra[0]
		}
		if c.Appointment != nil {
			if a.Payload == nil {
				a.Payload = map[string]string{}
			}
			a.Payload["appointmentId"] = c.Appointment.ID
			if c.Appointment.Start != nil {
				a.Payload["start"] = c.Appointment.Start.UTC().Format(time.RFC3339)
			}
		}
		return a
	}

	switch c.Type {
	case ghl.EventFormSubmitted, ghl.EventSurveySubmitted:
		svc := serviceFromForm(c)
		acts = append(acts,
			confirm(action.BookAppointment, now.Add(30*time.Second), "intake: offer booking slot", map[string]string{"service": svc}),
			action.Action{Kind: action.FollowUp, LocationID: c.LocationID, ContactID: contactID, DedupeKey: key("followup-72h"),
				RunAt: now.Add(72 * time.Hour), Priority: action.PriorityNormal, Reason: "intake: 72h nurture follow-up"},
		)
		if svc == "repair" {
			acts = append(acts, action.Action{Kind: action.FlagRepair, LocationID: c.LocationID, ContactID: contactID,
				DedupeKey: key("flag-repair"), RunAt: now, Priority: action.PriorityHigh, Reason: "intake classified as repair"})
		} else if svc == "replacement" {
			acts = append(acts, action.Action{Kind: action.FlagReplacement, LocationID: c.LocationID, ContactID: contactID,
				DedupeKey: key("flag-replacement"), RunAt: now, Priority: action.PriorityHigh, Reason: "intake classified as replacement"})
		}

	case ghl.EventAppointmentCreated:
		if c.Appointment != nil && c.Appointment.Start != nil {
			acts = append(acts, confirm(action.ScheduleConfirmation, now.Add(5*time.Second), "booking: instant confirmation"))
			acts = append(acts, confirm(action.ScheduleReminder, c.Appointment.Start.Add(-24*time.Hour), "booking: T-24h reminder"))
		}

	case ghl.EventAppointmentChanged:
		if c.Appointment != nil && c.Appointment.Status == "CONFIRMED" {
			acts = append(acts, confirm(action.ScheduleConfirmation, now, "status: confirmed"))
		}
		if c.Appointment != nil && (c.Appointment.Status == "CANCELED" || c.Appointment.Status == "CANCELLED") {
			acts = append(acts, confirm(action.MissedYou, now.Add(15*time.Minute), "cancel: missed-you win-back"))
			acts = append(acts, confirm(action.Reschedule, now.Add(30*time.Minute), "cancel: reschedule offer"))
		}
		if c.Appointment != nil && c.Appointment.Status == "RESCHEDULED" {
			acts = append(acts, confirm(action.Reschedule, now, "reschedule acknowledged"))
		}

	case ghl.EventAppointmentNoShow:
		acts = append(acts, confirm(action.NoShowFollowUp, now.Add(10*time.Minute), "no-show: re-engage"))

	case ghl.EventMessageInbound:
		intent := classifyInboundMessage(c.Message)
		switch intent {
		case "confirm":
			acts = append(acts, confirm(action.UpdateEstimate, now, "reply intent: confirm"))
		case "reschedule":
			acts = append(acts, confirm(action.Reschedule, now, "reply intent: reschedule"))
		case "stop":
			acts = append(acts, action.Action{Kind: action.ArchiveContact, LocationID: c.LocationID, ContactID: contactID,
				DedupeKey: key("archive"), RunAt: now, Priority: action.PriorityUrgent, Reason: "reply intent: opt-out — hard stop"})
		default:
			acts = append(acts, action.Action{Kind: action.NoteInquiry, LocationID: c.LocationID, ContactID: contactID,
				DedupeKey: key("note"), RunAt: now, Priority: action.PriorityNormal, Reason: "reply intent: general"})
		}

	case ghl.EventOpportunityMoved:
		if c.Opportunity != nil && c.Opportunity.StageName != "" {
			acts = append(acts, action.Action{Kind: action.UpdateEstimate, LocationID: c.LocationID, ContactID: contactID,
				DedupeKey: key("estimate-sync"), RunAt: now, Priority: action.PriorityHigh,
				Reason:  "opportunity stage: " + c.Opportunity.StageName,
				Payload: map[string]string{"stage": c.Opportunity.StageName}})
			if c.Opportunity.Value > 0 {
				acts = append(acts, action.Action{Kind: action.Digest, LocationID: c.LocationID,
					DedupeKey: key("digest"), RunAt: now.Add(5 * time.Minute), Priority: action.PriorityLow,
					Reason: fmt.Sprintf("pipeline value $%.2f moved", c.Opportunity.Value)})
			}
		}
	}
	return acts
}

// classifyInboundMessage performs the lightweight intent detection that the
// TypeScript side implements in src/lib/engine.ts (stop rules first).
func classifyInboundMessage(m *Message) string {
	if m == nil {
		return "general"
	}
	body := strings.ToLower(m.Body)
	switch {
	case containsAny(body, "stop", "unsubscribe", "opt out", "remove me", "do not text", "don't text"):
		return "stop"
	case containsAny(body, "reschedul", "move my appointment", "change my appointment", "come another day"):
		return "reschedule"
	case containsAny(body, "confirm", "yes that works", "see you", "sounds good"):
		return "confirm"
	default:
		return "general"
	}
}

// serviceFromForm infers the service class from intake answers; defaults to repair.
func serviceFromForm(c *Canonical) string {
	if c.Form == nil {
		return "repair"
	}
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

func containsAny(s string, subs ...string) bool {
	for _, sub := range subs {
		if strings.Contains(s, sub) {
			return true
		}
	}
	return false
}
