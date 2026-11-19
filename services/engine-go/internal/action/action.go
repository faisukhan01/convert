// Package action defines the automation intent contract shared by the
// pipeline (producer) and the queue/workers (consumers). Keeping it in its
// own package breaks the pipeline↔queue import cycle and lets either side
// evolve independently against this stable vocabulary.
package action

import "time"

// Kind enumerates automation intents the engine can emit downstream.
// The Next.js automation engine (src/lib/engine.ts) consumes these intents
// and performs the actual sends with its eligibility re-checks.
const (
	ScheduleConfirmation = "schedule_confirmation"
	ScheduleReminder     = "schedule_reminder"
	MissedYou            = "schedule_missed_you"
	Reschedule           = "schedule_reschedule"
	NoShowFollowUp       = "schedule_no_show_followup"
	FollowUp             = "schedule_followup"
	FlagRepair           = "flag_service_repair"
	FlagReplacement      = "flag_service_replacement"
	UpdateEstimate       = "update_estimate_intent"
	BookAppointment      = "book_appointment_intent"
	ArchiveContact       = "archive_contact_intent"
	Digest               = "enqueue_office_digest"
	NoteInquiry          = "note_inquiry"
)

// Priority bands; lower value executes first.
const (
	PriorityUrgent = 0
	PriorityHigh   = 1
	PriorityNormal = 2
	PriorityLow    = 3
)

// Action is one automation intent with its execution contract.
type Action struct {
	Kind       string            `json:"kind"`
	LocationID string            `json:"locationId"`
	ContactID  string            `json:"contactId,omitempty"`
	DedupeKey  string            `json:"dedupeKey"`
	RunAt      time.Time         `json:"runAt"`
	Priority   int               `json:"priority"` // lower = more urgent
	Payload    map[string]string `json:"payload,omitempty"`
	Reason     string            `json:"reason"`
}

// AllKinds lists every intent the engine understands (worker registration).
var AllKinds = []string{
	ScheduleConfirmation, ScheduleReminder, MissedYou, Reschedule, NoShowFollowUp,
	FollowUp, FlagRepair, FlagReplacement, UpdateEstimate, BookAppointment,
	Digest, NoteInquiry, ArchiveContact,
}
