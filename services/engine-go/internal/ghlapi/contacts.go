package ghlapi

import (
	"context"
	"fmt"
	"net/http"
	"strings"
	"time"
)

// ───────────────────────── contacts ─────────────────────────

// CreateContact creates a new contact in the pinned location.
func (c *Client) CreateContact(ctx context.Context, contact *Contact) (*Contact, error) {
	if contact.LocationID == "" {
		contact.LocationID = c.locationID
	}
	var out contactResponse
	if err := c.do(ctx, http.MethodPost, "/contacts/", nil, contact, &out); err != nil {
		return nil, err
	}
	return out.Contact, nil
}

// GetContact fetches one contact by id.
func (c *Client) GetContact(ctx context.Context, id string) (*Contact, error) {
	var out contactResponse
	if err := c.do(ctx, http.MethodGet, "/contacts/"+id, nil, nil, &out); err != nil {
		return nil, err
	}
	return out.Contact, nil
}

// UpdateContact patches an existing contact (partial update).
func (c *Client) UpdateContact(ctx context.Context, id string, patch *Contact) (*Contact, error) {
	var out contactResponse
	if err := c.do(ctx, http.MethodPut, "/contacts/"+id, nil, patch, &out); err != nil {
		return nil, err
	}
	return out.Contact, nil
}

// UpsertContact creates-or-updates by email or phone (GHL's native upsert).
func (c *Client) UpsertContact(ctx context.Context, contact *Contact) (*Contact, error) {
	if contact.LocationID == "" {
		contact.LocationID = c.locationID
	}
	var out contactResponse
	if err := c.do(ctx, http.MethodPost, "/contacts/upsert", nil, contact, &out); err != nil {
		return nil, err
	}
	return out.Contact, nil
}

// DeleteContact removes a contact permanently.
func (c *Client) DeleteContact(ctx context.Context, id string) error {
	return c.do(ctx, http.MethodDelete, "/contacts/"+id, nil, nil, nil)
}

// SearchContacts queries contacts by term with pagination.
func (c *Client) SearchContacts(ctx context.Context, query string, page int, limit int) ([]Contact, error) {
	q := map[string]string{}
	if query != "" {
		q["query"] = query
	}
	q["page"] = fmt.Sprintf("%d", page)
	if limit > 0 {
		q["limit"] = fmt.Sprintf("%d", limit)
	}
	var out contactsResponse
	if err := c.do(ctx, http.MethodGet, "/contacts/", q, nil, &out); err != nil {
		return nil, err
	}
	return out.Contacts, nil
}

// ListContactsAll walks every page of contacts matching the query.
// Guarded by maxPages so a provider-side pagination bug cannot spin forever.
func (c *Client) ListContactsAll(ctx context.Context, query string, maxPages int) ([]Contact, error) {
	if maxPages <= 0 {
		maxPages = 20
	}
	all := make([]Contact, 0, 64)
	for page := 1; page <= maxPages; page++ {
		batch, err := c.SearchContacts(ctx, query, page, 100)
		if err != nil {
			return all, err
		}
		all = append(all, batch...)
		if len(batch) < 100 {
			return all, nil
		}
	}
	return all, nil
}

// AddTags appends tags to a contact (idempotent upstream).
func (c *Client) AddTags(ctx context.Context, contactID string, tags ...string) error {
	clean := normalizeTags(tags)
	if len(clean) == 0 {
		return nil
	}
	body := map[string]any{"tags": clean}
	return c.do(ctx, http.MethodPost, fmt.Sprintf("/contacts/%s/tags", contactID), nil, body, nil)
}

// RemoveTags deletes tags from a contact.
func (c *Client) RemoveTags(ctx context.Context, contactID string, tags ...string) error {
	clean := normalizeTags(tags)
	if len(clean) == 0 {
		return nil
	}
	body := map[string]any{"tags": clean}
	return c.do(ctx, http.MethodDelete, fmt.Sprintf("/contacts/%s/tags", contactID), nil, body, nil)
}

// normalizeTags trims, drops empties and dedupes case-insensitively.
func normalizeTags(tags []string) []string {
	seen := make(map[string]struct{}, len(tags))
	out := make([]string, 0, len(tags))
	for _, t := range tags {
		t = strings.TrimSpace(t)
		if t == "" {
			continue
		}
		key := strings.ToLower(t)
		if _, dup := seen[key]; dup {
			continue
		}
		seen[key] = struct{}{}
		out = append(out, t)
	}
	return out
}

// AddNote appends a note to a contact timeline.
func (c *Client) AddNote(ctx context.Context, contactID string, body string) (*Note, error) {
	n := &Note{ContactID: contactID, Body: body}
	var out noteResponse
	if err := c.do(ctx, http.MethodPost, fmt.Sprintf("/contacts/%s/notes", contactID), nil, n, &out); err != nil {
		return nil, err
	}
	return out.Note, nil
}

// ListNotes returns the contact's notes, most recent first.
func (c *Client) ListNotes(ctx context.Context, contactID string, limit int) ([]Note, error) {
	q := map[string]string{}
	if limit > 0 {
		q["limit"] = fmt.Sprintf("%d", limit)
	}
	var out notesResponse
	if err := c.do(ctx, http.MethodGet, fmt.Sprintf("/contacts/%s/notes", contactID), q, nil, &out); err != nil {
		return nil, err
	}
	return out.Notes, nil
}

// ───────────────────────── opportunities ─────────────────────────

// CreateOpportunity adds a card to a pipeline stage.
func (c *Client) CreateOpportunity(ctx context.Context, opp *Opportunity) (*Opportunity, error) {
	if opp.LocationID == "" {
		opp.LocationID = c.locationID
	}
	var out opportunityResponse
	if err := c.do(ctx, http.MethodPost, "/opportunities/", nil, opp, &out); err != nil {
		return nil, err
	}
	return out.Opportunity, nil
}

// GetOpportunity fetches one opportunity by id.
func (c *Client) GetOpportunity(ctx context.Context, id string) (*Opportunity, error) {
	var out opportunityResponse
	if err := c.do(ctx, http.MethodGet, "/opportunities/"+id, nil, nil, &out); err != nil {
		return nil, err
	}
	return out.Opportunity, nil
}

// UpdateOpportunity patches stage, status or value of a card.
func (c *Client) UpdateOpportunity(ctx context.Context, id string, patch *Opportunity) (*Opportunity, error) {
	var out opportunityResponse
	if err := c.do(ctx, http.MethodPut, "/opportunities/"+id, nil, patch, &out); err != nil {
		return nil, err
	}
	return out.Opportunity, nil
}

// SearchOpportunities lists cards filtered by pipeline/status.
func (c *Client) SearchOpportunities(ctx context.Context, pipelineID, status string, page, limit int) ([]Opportunity, error) {
	q := map[string]string{"locationId": c.locationID}
	if pipelineID != "" {
		q["pipelineId"] = pipelineID
	}
	if status != "" {
		q["status"] = status
	}
	q["page"] = fmt.Sprintf("%d", page)
	if limit > 0 {
		q["limit"] = fmt.Sprintf("%d", limit)
	}
	var out opportunitiesResponse
	if err := c.do(ctx, http.MethodGet, "/opportunities/", q, nil, &out); err != nil {
		return nil, err
	}
	return out.Opportunities, nil
}

// MoveOpportunityStage moves a card to another stage of the same pipeline.
func (c *Client) MoveOpportunityStage(ctx context.Context, oppID, stageID string) (*Opportunity, error) {
	patch := &Opportunity{PipelineStageID: stageID}
	return c.UpdateOpportunity(ctx, oppID, patch)
}

// SetOpportunityStatus marks a card won/lost/abandoned/open.
func (c *Client) SetOpportunityStatus(ctx context.Context, oppID, status string) (*Opportunity, error) {
	patch := &Opportunity{Status: strings.ToLower(status)}
	return c.UpdateOpportunity(ctx, oppID, patch)
}

// ───────────────────────── pipelines ─────────────────────────

// ListPipelines returns all pipelines of the location with stages.
func (c *Client) ListPipelines(ctx context.Context) ([]Pipeline, error) {
	var out pipelinesResponse
	if err := c.do(ctx, http.MethodGet, "/pipelines/", nil, nil, &out); err != nil {
		return nil, err
	}
	return out.Pipelines, nil
}

// FindStage resolves (pipelineID, stageName) to the concrete stage id.
// Matching is case-insensitive and trims whitespace.
func (c *Client) FindStage(ctx context.Context, pipelineID, stageName string) (string, error) {
	pipelines, err := c.ListPipelines(ctx)
	if err != nil {
		return "", err
	}
	want := strings.ToLower(strings.TrimSpace(stageName))
	for _, p := range pipelines {
		if pipelineID != "" && p.ID != pipelineID {
			continue
		}
		for _, st := range p.Stages {
			if strings.ToLower(strings.TrimSpace(st.Name)) == want {
				return st.ID, nil
			}
		}
	}
	return "", fmt.Errorf("ghlapi: stage %q not found in pipeline %q", stageName, pipelineID)
}

// ───────────────────────── appointments ─────────────────────────

// ListAppointments returns calendar bookings for a contact.
func (c *Client) ListAppointments(ctx context.Context, contactID string) ([]Appointment, error) {
	q := map[string]string{"locationId": c.locationID, "contactId": contactID}
	var out appointmentsResponse
	if err := c.do(ctx, http.MethodGet, "/appointments/", q, nil, &out); err != nil {
		return nil, err
	}
	return out.Appointments, nil
}

// SetAppointmentStatus updates a booking status (confirmed/cancelled/...).
func (c *Client) SetAppointmentStatus(ctx context.Context, apptID, status string) error {
	body := map[string]any{"status": strings.ToLower(status)}
	return c.do(ctx, http.MethodPut, "/appointments/"+apptID, nil, body, nil)
}

// Touch keeps the import side of the file honest even if time is not used
// directly here yet (templates below rely on the caller formatting times).
var _ = time.Now
