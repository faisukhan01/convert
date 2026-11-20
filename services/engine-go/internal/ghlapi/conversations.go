package ghlapi

import (
	"context"
	"fmt"
	"net/http"
	"strings"
)

// ───────────────────────── conversations ─────────────────────────

// ListConversations returns messaging threads, optionally for one contact.
func (c *Client) ListConversations(ctx context.Context, contactID string, page, limit int) ([]Conversation, error) {
	q := map[string]string{"locationId": c.locationID}
	if contactID != "" {
		q["contactId"] = contactID
	}
	q["page"] = fmt.Sprintf("%d", page)
	if limit > 0 {
		q["limit"] = fmt.Sprintf("%d", limit)
	}
	var out conversationsResponse
	if err := c.do(ctx, http.MethodGet, "/conversations/", q, nil, &out); err != nil {
		return nil, err
	}
	return out.Conversations, nil
}

// GetConversationMessages lists the messages inside a thread.
func (c *Client) GetConversationMessages(ctx context.Context, conversationID string, limit int) ([]Message, error) {
	q := map[string]string{}
	if limit > 0 {
		q["limit"] = fmt.Sprintf("%d", limit)
	}
	var out messagesResponse
	if err := c.do(ctx, http.MethodGet, "/conversations/messages", q, nil, &out); err != nil {
		return nil, err
	}
	// Filter client-side: GHL returns a global stream; the caller asked for
	// one thread's view.
	kept := make([]Message, 0, len(out.Messages))
	for _, m := range out.Messages {
		if m.ConversationID == conversationID {
			kept = append(kept, m)
		}
	}
	return kept, nil
}

// SendSMS sends an SMS to a contact (thread auto-created if absent).
func (c *Client) SendSMS(ctx context.Context, contactID, body string) (*conversationResponse, error) {
	if strings.TrimSpace(body) == "" {
		return nil, fmt.Errorf("ghlapi: empty SMS body")
	}
	payload := map[string]any{
		"type":      "SMS",
		"contactId": contactID,
		"message":   body,
	}
	var out conversationResponse
	if err := c.do(ctx, http.MethodPost, "/conversations/messages", nil, payload, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

// SendEmail sends a transactional email from a configured sender identity.
func (c *Client) SendEmail(ctx context.Context, contactID, subject, html string, from *Sender) (*conversationResponse, error) {
	payload := map[string]any{
		"type":      "Email",
		"contactId": contactID,
		"subject":   subject,
		"html":      html,
		"message":   stripHTML(html),
	}
	if from != nil {
		payload["emailSender"] = from
	}
	var out conversationResponse
	if err := c.do(ctx, http.MethodPost, "/conversations/messages", nil, payload, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

// AddInboundMessage records an inbound message (e.g. imported history).
func (c *Client) AddInboundMessage(ctx context.Context, contactID, msgType, body string) (*conversationResponse, error) {
	payload := map[string]any{
		"type":      msgType,
		"contactId": contactID,
		"message":   body,
		"direction": "inbound",
	}
	var out conversationResponse
	if err := c.do(ctx, http.MethodPost, "/conversations/messages/inbound", nil, payload, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

// stripHTML produces a plain-text fallback of an HTML email body.
func stripHTML(html string) string {
	var b strings.Builder
	in := false
	for _, r := range html {
		switch {
		case r == '<':
			in = true
		case r == '>':
			in = false
		case !in:
			b.WriteRune(r)
		}
	}
	out := strings.Join(strings.Fields(b.String()), " ")
	return out
}

// ───────────────────────── automation: workflows ─────────────────────────

// ListWorkflows returns the location's automation workflows.
func (c *Client) ListWorkflows(ctx context.Context) ([]Workflow, error) {
	var out workflowsResponse
	if err := c.do(ctx, http.MethodGet, "/workflows/", nil, nil, &out); err != nil {
		return nil, err
	}
	return out.Workflows, nil
}

// AddContactToWorkflow enrolls a contact into a published workflow.
func (c *Client) AddContactToWorkflow(ctx context.Context, workflowID, contactID string) error {
	path := fmt.Sprintf("/workflows/%s/contacts/%s", workflowID, contactID)
	return c.do(ctx, http.MethodPost, path, nil, nil, nil)
}

// RemoveContactFromWorkflow pulls a contact out of a workflow.
func (c *Client) RemoveContactFromWorkflow(ctx context.Context, workflowID, contactID string) error {
	path := fmt.Sprintf("/workflows/%s/contacts/%s", workflowID, contactID)
	return c.do(ctx, http.MethodDelete, path, nil, nil, nil)
}

// ───────────────────────── tasks ─────────────────────────

// CreateTask adds a follow-up task for a contact.
func (c *Client) CreateTask(ctx context.Context, task *Task) (*Task, error) {
	if task.LocationID == "" {
		task.LocationID = c.locationID
	}
	var out taskResponse
	if err := c.do(ctx, http.MethodPost, fmt.Sprintf("/contacts/%s/tasks", task.ContactID), nil, task, &out); err != nil {
		return nil, err
	}
	return out.Task, nil
}

// CompleteTask flips a task to completed.
func (c *Client) CompleteTask(ctx context.Context, contactID, taskID string) error {
	body := map[string]any{"completed": true}
	return c.do(ctx, http.MethodPut, fmt.Sprintf("/contacts/%s/tasks/%s", contactID, taskID), nil, body, nil)
}

// ListTasks returns open tasks for a contact.
func (c *Client) ListTasks(ctx context.Context, contactID string, completedOnly bool) ([]Task, error) {
	q := map[string]string{}
	if completedOnly {
		q["completed"] = "true"
	}
	var out tasksResponse
	if err := c.do(ctx, http.MethodGet, fmt.Sprintf("/contacts/%s/tasks", contactID), q, nil, &out); err != nil {
		return nil, err
	}
	return out.Tasks, nil
}

// ───────────────────────── users & custom fields ─────────────────────────

// ListUsers returns team members of the location.
func (c *Client) ListUsers(ctx context.Context) ([]User, error) {
	var out usersResponse
	if err := c.do(ctx, http.MethodGet, "/users/", nil, nil, &out); err != nil {
		return nil, err
	}
	return out.Users, nil
}

// ListCustomFields returns custom field definitions of the location.
func (c *Client) ListCustomFields(ctx context.Context) ([]CustomField, error) {
	var out customFieldsResponse
	if err := c.do(ctx, http.MethodGet, "/contacts/custom-fields", nil, nil, &out); err != nil {
		return nil, err
	}
	return out.CustomFields, nil
}

// CreateCustomField adds a new custom field definition.
func (c *Client) CreateCustomField(ctx context.Context, field *CustomField) (*CustomField, error) {
	if field.LocationID == "" {
		field.LocationID = c.locationID
	}
	var out struct {
		CustomField *CustomField `json:"customField"`
	}
	if err := c.do(ctx, http.MethodPost, "/contacts/custom-fields", nil, field, &out); err != nil {
		return nil, err
	}
	return out.CustomField, nil
}
