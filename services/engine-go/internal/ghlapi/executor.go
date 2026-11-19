package ghlapi

import (
	"context"
	"fmt"
	"log/slog"
	"strings"
	"sync"
	"time"

	"github.com/faisukhan01/convert/services/engine-go/internal/action"
	"github.com/faisukhan01/convert/services/engine-go/internal/metrics"
)

// Executor translates engine automation intents (action.Action) into real
// GoHighLevel API calls. It is the "hands" of the engine: the pipeline plans,
// the queue schedules, the executor touches the CRM.
//
// Every send is guarded by a local suppression cache keyed by the intent's
// dedupe key, so even if upstream dedupe layers miss, the executor never
// double-sends within the process lifetime.
type Executor struct {
	client  *Client
	lim     *limiter // conservative send budget: 60 sends/min per process
	sent    map[string]time.Time
	sentMu  sync.Mutex
	metrics *metrics.Registry
	dryRun  bool
	nowFn   func() time.Time
}

// NewExecutor builds an executor bound to a client and metrics registry.
func NewExecutor(client *Client, reg *metrics.Registry, dryRun bool) *Executor {
	return &Executor{
		client:  client,
		lim:     newLimiter(1.0, 20), // steady 1 msg/s, burst 20
		sent:    make(map[string]time.Time, 256),
		metrics: reg,
		dryRun:  dryRun,
		nowFn:   time.Now,
	}
}

// DryRun reports whether sends are simulated (no real provider calls).
func (e *Executor) DryRun() bool { return e.dryRun }

// Client exposes the underlying typed client (read-only use by handlers).
func (e *Executor) Client() *Client { return e.client }

// executed marks a dedupe key and returns false when it was already sent.
func (e *Executor) markSent(key string) bool {
	e.sentMu.Lock()
	defer e.sentMu.Unlock()
	if _, ok := e.sent[key]; ok {
		return false
	}
	e.sent[key] = e.nowFn()
	// Opportunistic GC: keep the cache bounded without a background goroutine.
	if len(e.sent) > 4096 {
		cutoff := e.nowFn().Add(-24 * time.Hour)
		for k, ts := range e.sent {
			if ts.Before(cutoff) {
				delete(e.sent, k)
			}
		}
	}
	return true
}

// Execute performs the CRM side effects for one automation intent.
// It returns an error only for infrastructure-level failures; logical
// suppressions (duplicate sends, dry-run) are not errors.
func (e *Executor) Execute(ctx context.Context, a action.Action) error {
	if e.metrics != nil {
		e.metrics.Inc(metrics.CounterGHLCallsTotal)
	}
	if err := e.lim.acquire(ctx); err != nil {
		return err
	}

	if !e.markSent(a.DedupeKey) {
		return nil // already executed this intent in-process
	}

	if e.dryRun {
		slog.Info("executor dry-run", "kind", a.Kind, "contact", a.ContactID, "reason", a.Reason)
		return nil
	}

	var err error
	switch a.Kind {
	case action.ScheduleConfirmation:
		err = e.sendTemplate(ctx, a, "Appointment confirmed", "See you soon — your appointment is locked in.")
	case action.ScheduleReminder:
		err = e.sendTemplate(ctx, a, "Appointment reminder", "Reminder: your appointment is coming up in about 24 hours.")
	case action.MissedYou:
		err = e.sendTemplate(ctx, a, "We missed you", "Sorry we missed you. Want to grab another slot?")
	case action.Reschedule:
		err = e.sendTemplate(ctx, a, "Reschedule link", "No problem — here is your reschedule link whenever you are ready.")
	case action.NoShowFollowUp:
		err = e.sendTemplate(ctx, a, "Still want help?", "We kept your file open. Reply REBOOK and we will set a new time.")
	case action.FollowUp:
		err = e.sendTemplate(ctx, a, "Checking in", "Just checking in — any questions we can answer for you?")
	case action.FlagRepair:
		err = e.client.AddTags(ctx, a.ContactID, "service:repair")
	case action.FlagReplacement:
		err = e.client.AddTags(ctx, a.ContactID, "service:replacement")
	case action.UpdateEstimate:
		stage := a.Payload["stage"]
		err = e.handleEstimate(ctx, a, stage)
	case action.BookAppointment:
		err = e.handleBookAppointment(ctx, a)
	case action.NoteInquiry:
		err = e.handleNote(ctx, a)
	case action.Digest:
		err = e.handleDigest(ctx, a)
	case action.ArchiveContact:
		err = e.handleOptOut(ctx, a)
	default:
		slog.Debug("executor: no GHL mapping for kind", "kind", a.Kind)
		return nil
	}

	if err != nil {
		if e.metrics != nil {
			e.metrics.Inc(metrics.CounterGHLErrorsTotal)
		}
	}
	return err
}

// sendTemplate sends an SMS whose text is derived from the intent payload
// and a polite template. Contact name is resolved best-effort for warmth.
func (e *Executor) sendTemplate(ctx context.Context, a action.Action, title, body string) error {
	if a.ContactID == "" {
		return fmt.Errorf("executor: %s requires a contactId", a.Kind)
	}
	name := ""
	if n := a.Payload["name"]; n != "" {
		name = strings.TrimSpace(strings.SplitN(n, " ", 2)[0])
	}
	text := body
	if name != "" {
		text = "Hi " + name + "! " + body
	}
	if extra := a.Payload["service"]; extra != "" {
		text += " (" + strings.ReplaceAll(extra, "-", " ") + ")"
	}
	_, err := e.client.SendSMS(ctx, a.ContactID, text)
	if err == nil {
		slog.Info("sms sent", "kind", a.Kind, "contact", a.ContactID)
	}
	return err
}

// handleEstimate records stage movement on the CRM: tag + note (the
// opportunity sync itself is driven by the webhook that triggered this).
func (e *Executor) handleEstimate(ctx context.Context, a action.Action, stage string) error {
	tags := []string{"stage-synced"}
	if stage != "" {
		tags = append(tags, "stage:"+slug(stage))
	}
	if err := e.client.AddTags(ctx, a.ContactID, tags...); err != nil && !IsNotFound(err) {
		return err
	}
	note := "Opportunity stage updated"
	if stage != "" {
		note += " to: " + stage
	}
	if a.Reason != "" {
		note += " — " + a.Reason
	}
	_, err := e.client.AddNote(ctx, a.ContactID, note)
	return err
}

// handleBookAppointment creates a task so an operator can take the booking.
func (e *Executor) handleBookAppointment(ctx context.Context, a action.Action) error {
	task := &Task{
		ContactID: a.ContactID,
		Title:     "Book appointment",
		Body:      firstNonEmptyStr(a.Payload["service"], "Intake follow-up") + " — offer slots to the lead.",
		Priority:  "high",
	}
	if due := a.Payload["dueAt"]; due != "" {
		if t, err := time.Parse(time.RFC3339, due); err == nil {
			task.DueDate = &t
		}
	}
	_, err := e.client.CreateTask(ctx, task)
	return err
}

// handleNote pins a note documenting the inquiry.
func (e *Executor) handleNote(ctx context.Context, a action.Action) error {
	if a.ContactID == "" {
		return nil
	}
	body := firstNonEmptyStr(a.Payload["note"], a.Reason, "General inquiry captured by the automation engine.")
	_, err := e.client.AddNote(ctx, a.ContactID, body)
	return err
}

// handleDigest appends a location-level digest marker note on the contact
// (location digests without a contact are acknowledged and skipped).
func (e *Executor) handleDigest(ctx context.Context, a action.Action) error {
	if a.ContactID == "" {
		slog.Debug("digest has no contact; acknowledged only", "location", a.LocationID)
		return nil
	}
	_, err := e.client.AddNote(ctx, a.ContactID, "Pipeline digest: "+firstNonEmptyStr(a.Reason, "value moved"))
	return err
}

// handleOptOut is the hard stop: tag, note, and remove from nurture flows.
func (e *Executor) handleOptOut(ctx context.Context, a action.Action) error {
	if a.ContactID == "" {
		return nil
	}
	if err := e.client.AddTags(ctx, a.ContactID, "opted-out", "do-not-contact"); err != nil && !IsNotFound(err) {
		return err
	}
	_, err := e.client.AddNote(ctx, a.ContactID, "Opt-out applied (hard stop). Suppressed from all outbound automation.")
	return err
}

// slug turns a stage name into a tag-safe token: "Qualified Lead" -> "qualified-lead".
func slug(s string) string {
	s = strings.ToLower(strings.TrimSpace(s))
	var b strings.Builder
	lastDash := false
	for _, r := range s {
		switch {
		case r >= 'a' && r <= 'z', r >= '0' && r <= '9':
			b.WriteRune(r)
			lastDash = false
		default:
			if !lastDash && b.Len() > 0 {
				b.WriteByte('-')
				lastDash = true
			}
		}
	}
	return strings.Trim(b.String(), "-")
}

func firstNonEmptyStr(vals ...string) string {
	for _, v := range vals {
		if v != "" {
			return v
		}
	}
	return ""
}
