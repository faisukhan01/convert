// Package ghlapi is the GoHighLevel (LeadConnector) API v2 client SDK used
// by the RidgeLine Go engine. It wraps every surface the automation stack
// needs — contacts, opportunities, pipelines, conversations, workflows,
// tasks, notes, tags, users and custom fields — behind a typed, retry-aware,
// rate-limited client so the rest of the engine never touches raw HTTP.
//
// The package is deliberately dependency-free (stdlib only) so it can be
// embedded in any Go service that talks to a GHL sub-account.
package ghlapi

import "time"

// Contact is the GHL contact record (create/update shapes unified).
type Contact struct {
	ID           string             `json:"id,omitempty"`
	LocationID   string             `json:"locationId,omitempty"`
	FirstName    string             `json:"firstName,omitempty"`
	LastName     string             `json:"lastName,omitempty"`
	FullName     string             `json:"fullName,omitempty"`
	Email        string             `json:"email,omitempty"`
	Phone        string             `json:"phone,omitempty"`
	Address1     string             `json:"address1,omitempty"`
	City         string             `json:"city,omitempty"`
	State        string             `json:"state,omitempty"`
	PostalCode   string             `json:"postalCode,omitempty"`
	Country      string             `json:"country,omitempty"`
	Timezone     string             `json:"timezone,omitempty"`
	Tags         []string           `json:"tags,omitempty"`
	CustomFields []CustomFieldValue `json:"customFields,omitempty"`
	Attribution  *Attribution       `json:"attribution,omitempty"`
	DateAdded    *time.Time         `json:"dateAdded,omitempty"`
	DateUpdated  *time.Time         `json:"dateUpdated,omitempty"`
}

// CustomFieldValue is one custom field binding on a contact.
type CustomFieldValue struct {
	ID    string `json:"id,omitempty"`
	Key   string `json:"key,omitempty"`
	Name  string `json:"name,omitempty"`
	Value any    `json:"value"`
}

// Attribution carries lead source tracking data.
type Attribution struct {
	Source      string `json:"source,omitempty"`
	Medium      string `json:"medium,omitempty"`
	Campaign    string `json:"campaign,omitempty"`
	UTMSource   string `json:"utmSource,omitempty"`
	UTMMedium   string `json:"utmMedium,omitempty"`
	UTMCampaign string `json:"utmCampaign,omitempty"`
}

// Opportunity is a pipeline card.
type Opportunity struct {
	ID              string     `json:"id,omitempty"`
	LocationID      string     `json:"locationId,omitempty"`
	PipelineID      string     `json:"pipelineId,omitempty"`
	PipelineStageID string     `json:"pipelineStageId,omitempty"`
	Status          string     `json:"status,omitempty"` // open | won | lost | abandoned
	Name            string     `json:"name,omitempty"`
	MonetaryValue   float64    `json:"monetaryValue,omitempty"`
	ContactID       string     `json:"contactId,omitempty"`
	AssignedTo      string     `json:"assignedTo,omitempty"`
	Notes           string     `json:"notes,omitempty"`
	CreatedAt       *time.Time `json:"createdAt,omitempty"`
	UpdatedAt       *time.Time `json:"updatedAt,omitempty"`
	StatusSetAt     *time.Time `json:"statusSetAt,omitempty"`
}

// Pipeline is a named pipeline with its ordered stages.
type Pipeline struct {
	ID         string  `json:"id"`
	LocationID string  `json:"locationId,omitempty"`
	Name       string  `json:"name"`
	Stages     []Stage `json:"stages,omitempty"`
}

// Stage is one column of a pipeline.
type Stage struct {
	ID                string `json:"id"`
	Name              string `json:"name"`
	Position          int    `json:"position,omitempty"`
	OpenOpportunities int    `json:"openOpportunities,omitempty"`
}

// Conversation is a messaging thread with a contact.
type Conversation struct {
	ID              string     `json:"id"`
	LocationID      string     `json:"locationId,omitempty"`
	ContactID       string     `json:"contactId,omitempty"`
	LastMessage     string     `json:"lastMessageBody,omitempty"`
	LastMsgType     string     `json:"lastMessagetype,omitempty"`
	Unread          int        `json:"unreadCount,omitempty"`
	Starred         bool       `json:"starred,omitempty"`
	DateLastMessage *time.Time `json:"dateLastMessage,omitempty"`
}

// Message is a single SMS/email/WhatsApp payload inside a conversation.
type Message struct {
	ID             string     `json:"id,omitempty"`
	ConversationID string     `json:"conversationId,omitempty"`
	ContactID      string     `json:"contactId,omitempty"`
	Type           string     `json:"type"` // SMS | Email | WhatsApp | FB | IG | Live_Chat
	Message        string     `json:"message"`
	Html           string     `json:"html,omitempty"`
	Subject        string     `json:"subject,omitempty"`
	Sender         *Sender    `json:"emailSender,omitempty"`
	Direction      string     `json:"direction,omitempty"` // inbound | outbound
	Status         string     `json:"status,omitempty"`    // delivered | sent | failed
	DateAdded      *time.Time `json:"dateAdded,omitempty"`
}

// Sender is the outbound email identity.
type Sender struct {
	Name    string `json:"name,omitempty"`
	Email   string `json:"email,omitempty"`
	ReplyTo string `json:"replyTo,omitempty"`
}

// Note is a note pinned on a contact.
type Note struct {
	ID        string     `json:"id,omitempty"`
	ContactID string     `json:"contactId,omitempty"`
	Body      string     `json:"body"`
	DateAdded *time.Time `json:"dateAdded,omitempty"`
}

// Task is a to-do assigned to a team member for a contact.
type Task struct {
	ID         string     `json:"id,omitempty"`
	LocationID string     `json:"locationId,omitempty"`
	ContactID  string     `json:"contactId,omitempty"`
	Title      string     `json:"title"`
	Body       string     `json:"body,omitempty"`
	DueDate    *time.Time `json:"dueDate,omitempty"`
	Completed  bool       `json:"completed,omitempty"`
	AssignedTo string     `json:"assignedTo,omitempty"`
	Priority   string     `json:"priority,omitempty"` // high | normal | low
}

// Appointment is a calendar booking.
type Appointment struct {
	ID         string     `json:"id,omitempty"`
	CalendarID string     `json:"calendarId,omitempty"`
	ContactID  string     `json:"contactId,omitempty"`
	Title      string     `json:"title,omitempty"`
	Status     string     `json:"status,omitempty"` // confirmed | new | cancelled | showed | no_show
	StartTime  *time.Time `json:"startTime,omitempty"`
	EndTime    *time.Time `json:"endTime,omitempty"`
	Address    string     `json:"address,omitempty"`
	AssignedTo string     `json:"assignedTo,omitempty"`
}

// Workflow is an automation workflow definition.
type Workflow struct {
	ID          string         `json:"id"`
	LocationID  string         `json:"locationId,omitempty"`
	Name        string         `json:"name"`
	Status      string         `json:"status,omitempty"` // published | draft
	Description string         `json:"description,omitempty"`
	Stats       *WorkflowStats `json:"stats,omitempty"`
}

// WorkflowStats aggregates workflow performance counters returned by the API.
type WorkflowStats struct {
	Enrolled  int `json:"enrolled,omitempty"`
	Completed int `json:"completed,omitempty"`
	Active    int `json:"active,omitempty"`
}

// User is a team member of the location.
type User struct {
	ID        string   `json:"id"`
	Email     string   `json:"email,omitempty"`
	FirstName string   `json:"firstName,omitempty"`
	LastName  string   `json:"lastName,omitempty"`
	Roles     []string `json:"roles,omitempty"`
}

// CustomField is a location-level custom field definition.
type CustomField struct {
	ID         string              `json:"id"`
	LocationID string              `json:"locationId,omitempty"`
	Name       string              `json:"name"`
	DataType   string              `json:"dataType"` // TEXT | LARGE_TEXT | NUMBER | SINGLE_OPTION ...
	Key        string              `json:"fieldKey,omitempty"`
	Options    []CustomFieldOption `json:"options,omitempty"`
}

// CustomFieldOption is one choice for SINGLE_OPTION / MULTIPLE_OPTION fields.
type CustomFieldOption struct {
	ID   string `json:"id,omitempty"`
	Name string `json:"name"`
}

// ───────────────────────── list envelopes ─────────────────────────

// meta is the pagination block GHL attaches to every list response.
type meta struct {
	Total      int    `json:"total"`
	TotalPage  int    `json:"totalPage"`
	NextPage   int    `json:"nextPage"`
	PrevPage   int    `json:"prevPage"`
	NextPageID string `json:"nextPageId"`
}

type contactsResponse struct {
	Contacts []Contact `json:"contacts"`
	Meta     *meta     `json:"meta,omitempty"`
}

type opportunitiesResponse struct {
	Opportunities []Opportunity `json:"opportunities"`
	Meta          *meta         `json:"meta,omitempty"`
}

type pipelinesResponse struct {
	Pipelines []Pipeline `json:"pipelines"`
}

type conversationsResponse struct {
	Conversations []Conversation `json:"conversations"`
	Meta          *meta          `json:"meta,omitempty"`
}

type messagesResponse struct {
	Messages []Message `json:"messages"`
	Meta     *meta     `json:"meta,omitempty"`
}

type notesResponse struct {
	Notes []Note `json:"notes"`
	Meta  *meta  `json:"meta,omitempty"`
}

type tasksResponse struct {
	Tasks []Task `json:"tasks"`
	Meta  *meta  `json:"meta,omitempty"`
}

type workflowsResponse struct {
	Workflows []Workflow `json:"workflows"`
}

type usersResponse struct {
	Users []User `json:"users"`
}

type customFieldsResponse struct {
	CustomFields []CustomField `json:"customFields"`
}

type appointmentsResponse struct {
	Appointments []Appointment `json:"events"`
	Meta         *meta         `json:"meta,omitempty"`
}

// contactResponse wraps single-contact GETs.
type contactResponse struct {
	Contact *Contact `json:"contact"`
}

// opportunityResponse wraps single-opportunity GETs.
type opportunityResponse struct {
	Opportunity *Opportunity `json:"opportunity"`
}

// noteResponse wraps single-note creation responses.
type noteResponse struct {
	Note *Note `json:"note"`
}

// taskResponse wraps single-task creation responses.
type taskResponse struct {
	Task *Task `json:"task"`
}

// conversationResponse wraps the send-message response.
type conversationResponse struct {
	ConversationID string `json:"conversationId"`
	MessageID      string `json:"messageId"`
}

// successfulResponse is the generic { succeeded: true } body used by tag,
// workflow-enrollment and similar mutation endpoints.
type successfulResponse struct {
	Succeeded bool `json:"succeeded"`
}
