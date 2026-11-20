// Package pipeline turns raw provider webhooks into canonical events and
// then into automation action intents. Stages are small, pure where possible
// and fully unit-testable; the orchestration lives in Run.
package pipeline

import (
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/faisukhan01/convert/services/engine-go/internal/webhook/ghl"
)

// Canonical is the normalized, provider-agnostic event the engine operates on.
type Canonical struct {
	Seq         uint64         `json:"seq,omitempty"`
	Type        string         `json:"type"`
	LocationID  string         `json:"locationId"`
	ContactID   string         `json:"contactId,omitempty"`
	Contact     ContactRef     `json:"contact"`
	Appointment *Appointment   `json:"appointment,omitempty"`
	Message     *Message       `json:"message,omitempty"`
	Form        *Form          `json:"form,omitempty"`
	Opportunity *Opportunity   `json:"opportunity,omitempty"`
	Tag         string         `json:"tag,omitempty"`
	Custom      map[string]any `json:"custom,omitempty"`
	ObservedAt  time.Time      `json:"observedAt"`
	Source      string         `json:"source"` // "ghl"
}

// ContactRef is the identity projection carried on every canonical event.
type ContactRef struct {
	ID    string `json:"id,omitempty"`
	Name  string `json:"name,omitempty"`
	Email string `json:"email,omitempty"`
	Phone string `json:"phone,omitempty"`
}

// Appointment models scheduling context.
type Appointment struct {
	ID         string     `json:"id,omitempty"`
	CalendarID string     `json:"calendarId,omitempty"`
	Title      string     `json:"title,omitempty"`
	Start      *time.Time `json:"start,omitempty"`
	End        *time.Time `json:"end,omitempty"`
	Status     string     `json:"status,omitempty"`
}

// Message models conversation context.
type Message struct {
	ID        string `json:"id,omitempty"`
	Body      string `json:"body,omitempty"`
	Direction string `json:"direction,omitempty"` // inbound | outbound
	Type      string `json:"type,omitempty"`      // sms | email | call | whatsapp
}

// Form models form/survey submissions.
type Form struct {
	ID      string            `json:"id,omitempty"`
	Name    string            `json:"name,omitempty"`
	Answers map[string]string `json:"answers,omitempty"`
}

// Opportunity models pipeline stage movement.
type Opportunity struct {
	ID         string  `json:"id,omitempty"`
	PipelineID string  `json:"pipelineId,omitempty"`
	StageID    string  `json:"stageId,omitempty"`
	StageName  string  `json:"stageName,omitempty"`
	Value      float64 `json:"value,omitempty"`
}

// Normalize maps a raw GHL payload to a Canonical event. Unknown provider
// types degrade to EventUnknown rather than erroring — forward compatibility.
func Normalize(p *ghl.Payload) *Canonical {
	c := &Canonical{
		Type:       Classify(p.Type),
		LocationID: p.LocationID,
		Source:     "ghl",
		ObservedAt: time.Now(),
	}
	c.ContactID, c.Contact.Name, c.Contact.Email, c.Contact.Phone = p.Identity()

	switch c.Type {
	case ghl.EventAppointmentCreated, ghl.EventAppointmentChanged, ghl.EventAppointmentNoShow:
		c.Appointment = &Appointment{
			ID:         p.AppointmentID,
			CalendarID: p.CalendarID,
			Title:      p.Title,
			Start:      p.StartTime,
			End:        p.EndTime,
			Status:     strings.ToUpper(p.Status),
		}
	case ghl.EventMessageInbound, ghl.EventMessageDropped:
		dir := strings.ToLower(p.Direction)
		if dir == "" {
			dir = "inbound"
		}
		c.Message = &Message{
			ID:        p.MessageID,
			Body:      p.MessageBody,
			Direction: dir,
			Type:      strings.ToLower(firstNonEmpty(p.MessageType, "sms")),
		}
	case ghl.EventFormSubmitted, ghl.EventSurveySubmitted:
		c.Form = &Form{ID: firstNonEmpty(p.FormID, p.SurveyID), Name: p.FormName, Answers: p.Answers}
	case ghl.EventOpportunityMoved:
		c.Opportunity = &Opportunity{
			ID:         p.OpportunityID,
			PipelineID: p.PipelineID,
			StageID:    p.StageID,
			StageName:  p.StageName,
			Value:      p.PipelineValue,
		}
	case ghl.EventTagApplied:
		c.Tag = p.Tag
	}
	if len(p.CustomData) > 0 {
		c.Custom = p.CustomData
	}
	return c
}

// Classify maps raw GHL webhook type strings onto the canonical vocabulary.
// Accepts PascalCase ("FormSubmitted"), snake_case ("form_submitted") and
// dotted ("form.submitted") forms so any provider generation normalizes.
func Classify(raw string) string {
	t := strings.ToLower(strings.TrimSpace(raw))
	t = strings.ReplaceAll(t, " ", "")
	t = strings.ReplaceAll(t, ".", "")
	t = strings.ReplaceAll(t, "_", "")
	switch t {
	case "contactcreated", "contactcreate":
		return ghl.EventContactCreated
	case "contactupdated":
		return ghl.EventContactUpdated
	case "formsubmitted":
		return ghl.EventFormSubmitted
	case "surveysubmitted":
		return ghl.EventSurveySubmitted
	case "appointmentcreated", "bookedappointment", "appointmentbooked":
		return ghl.EventAppointmentCreated
	case "appointmentstatuschanged", "appointmentchanged", "appointmentrescheduled", "appointmentcanceled", "appointmentcancelled":
		return ghl.EventAppointmentChanged
	case "appointmentnoshown", "noshow":
		return ghl.EventAppointmentNoShow
	case "inboundmessage", "messagereceived", "smsinbound":
		return ghl.EventMessageInbound
	case "messagedropped":
		return ghl.EventMessageDropped
	case "tagadded":
		return ghl.EventTagApplied
	case "opportunitystatusupdated", "opportunitystagemoved", "piplelinestageupdated", "pipelinestageupdated":
		return ghl.EventOpportunityMoved
	default:
		return ghl.EventUnknown
	}
}

// DedupeKey builds the idempotency key for a payload. Distinct provider
// objects get distinct keys; identical redeliveries collapse to one.
func DedupeKey(p *ghl.Payload) string {
	typ := Classify(p.Type)
	id, _, _, _ := p.Identity()
	object := firstNonEmpty(p.MessageID, p.AppointmentID, p.OpportunityID, p.FormID, p.SurveyID, id, p.Tag)
	return fmt.Sprintf("%s:%s:%s", p.LocationID, typ, object)
}

// OrderingKey groups events that must be processed in provider order.
// Scheduling events for one appointment and conversation messages for one
// contact are the two streams where ordering matters operationally.
func OrderingKey(c *Canonical) string {
	switch c.Type {
	case ghl.EventAppointmentCreated, ghl.EventAppointmentChanged, ghl.EventAppointmentNoShow:
		if c.Appointment != nil && c.Appointment.ID != "" {
			return fmt.Sprintf("appt:%s:%s", c.LocationID, c.Appointment.ID)
		}
	case ghl.EventMessageInbound, ghl.EventMessageDropped:
		if c.ContactID != "" {
			return fmt.Sprintf("msg:%s:%s", c.LocationID, c.ContactID)
		}
	}
	return ""
}

func firstNonEmpty(vals ...string) string {
	for _, v := range vals {
		if v != "" {
			return v
		}
	}
	return ""
}

// SortedKeys is a deterministic helper for stable JSON of custom data.
func SortedKeys(m map[string]string) []string {
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	return keys
}
