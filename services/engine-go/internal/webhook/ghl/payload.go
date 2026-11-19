// Package ghl models GoHighLevel (GHL) inbound webhook payloads and the
// canonical event vocabulary the RidgeLine engine normalizes them into.
// Field names follow GHL's webhook delivery schema; unknown fields are
// tolerated (the engine never rejects forward-compatible payloads).
package ghl

import "time"

// Canonical event types produced by the normalize stage. These strings are
// part of the engine's public contract and align with the TypeScript
// provider-event taxonomy in src/lib/providers.ts.
const (
	EventContactCreated     = "contact.created"
	EventContactUpdated     = "contact.updated"
	EventFormSubmitted      = "form.submitted"
	EventSurveySubmitted    = "survey.submitted"
	EventAppointmentCreated = "appointment.created"
	EventAppointmentChanged = "appointment.status_changed"
	EventAppointmentNoShow  = "appointment.no_show"
	EventMessageInbound     = "message.inbound"
	EventMessageDropped     = "message.dropped"
	EventTagApplied         = "tag.applied"
	EventOpportunityMoved   = "opportunity.stage_moved"
	EventUnknown            = "event.unknown"
)

// Payload is the raw GHL webhook body. Multiple content-type generations of
// the provider schema are accepted; identity fields fall back across aliases.
type Payload struct {
	Type       string `json:"type"`
	LocationID string `json:"locationId"`
	UserID     string `json:"userId"`

	// Contact identity (aliases across schema generations).
	ContactID   string   `json:"contactId"`
	Contact     *Contact `json:"contact"`
	ContactName string   `json:"contactName"`
	Email       string   `json:"email"`
	Phone       string   `json:"phone"`
	FullName    string   `json:"fullName"`
	FirstName   string   `json:"firstName"`
	LastName    string   `json:"lastName"`

	// Appointment context.
	AppointmentID string     `json:"appointmentId"`
	CalendarID    string     `json:"calendarId"`
	StartTime     *time.Time `json:"startTime"`
	EndTime       *time.Time `json:"endTime"`
	Status        string     `json:"appointmentStatus"`
	Title         string     `json:"title"`

	// Message context.
	MessageID   string `json:"messageId"`
	MessageBody string `json:"messageBody"`
	MessageType string `json:"messageType"`
	Direction   string `json:"direction"`

	// Form / survey context.
	FormID   string            `json:"formId"`
	FormName string            `json:"formName"`
	SurveyID string            `json:"surveyId"`
	Answers  map[string]string `json:"answers"`

	// Opportunity context.
	OpportunityID string  `json:"opportunityId"`
	PipelineID    string  `json:"pipelineId"`
	StageID       string  `json:"stageId"`
	StageName     string  `json:"stageName"`
	PipelineValue float64 `json:"value"`

	// Tag context.
	Tag string `json:"tag"`

	// Arbitrary passthrough for custom values.
	CustomData map[string]any `json:"customData"`
}

// Contact is the nested contact object present in newer GHL payloads.
type Contact struct {
	ID        string   `json:"id"`
	FirstName string   `json:"firstName"`
	LastName  string   `json:"lastName"`
	Email     string   `json:"email"`
	Phone     string   `json:"phone"`
	Tags      []string `json:"tags"`
}

// Identity resolves the contact identity with alias fallback:
// explicit fields → nested contact object → concatenated name parts.
func (p *Payload) Identity() (id, name, email, phone string) {
	id = p.ContactID
	name = p.ContactName
	email = p.Email
	phone = p.Phone

	if p.Contact != nil {
		if id == "" {
			id = p.Contact.ID
		}
		if name == "" {
			name = joinName(p.Contact.FirstName, p.Contact.LastName)
		}
		if email == "" {
			email = p.Contact.Email
		}
		if phone == "" {
			phone = p.Contact.Phone
		}
	}
	if name == "" && (p.FullName != "" || p.FirstName != "" || p.LastName != "") {
		name = joinName(firstNonEmpty(p.FullName, p.FirstName), p.LastName)
	}
	return id, name, email, phone
}

// IsMeaningful reports whether the payload carries enough information to act on.
func (p *Payload) IsMeaningful() bool {
	id, _, _, _ := p.Identity()
	return p.LocationID != "" && (id != "" || p.MessageID != "" || p.AppointmentID != "" || p.OpportunityID != "" || p.FormID != "")
}

func joinName(a, b string) string {
	switch {
	case a != "" && b != "":
		return a + " " + b
	case a != "":
		return a
	default:
		return b
	}
}

func firstNonEmpty(vals ...string) string {
	for _, v := range vals {
		if v != "" {
			return v
		}
	}
	return ""
}
