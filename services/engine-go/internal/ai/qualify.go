package ai

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
)

// LeadInput is what the brain sees about a lead.
type LeadInput struct {
	LocationID string            `json:"locationId"`
	ContactID  string            `json:"contactId,omitempty"`
	Name       string            `json:"name,omitempty"`
	Email      string            `json:"email,omitempty"`
	Phone      string            `json:"phone,omitempty"`
	Event      string            `json:"event,omitempty"`   // form.submitted, message.inbound ...
	Message    string            `json:"message,omitempty"` // free text from the lead
	Stage      string            `json:"stage,omitempty"`   // pipeline stage name
	Value      float64           `json:"value,omitempty"`   // opportunity value in USD
	Tags       []string          `json:"tags,omitempty"`
	Custom     map[string]string `json:"custom,omitempty"` // intake answers
}

// Verdict is the brain's structured judgment of a lead.
type Verdict struct {
	Score            int      `json:"score"`   // 0..100
	Intent           string   `json:"intent"`  // buy | repair | replace | question | reschedule | cancel | optout | unknown
	Urgency          string   `json:"urgency"` // high | medium | low
	Summary          string   `json:"summary"` // one-line human summary
	Reasoning        string   `json:"reasoning,omitempty"`
	SuggestedActions []string `json:"suggestedActions,omitempty"`
	Source           string   `json:"source"` // "ai" | "heuristic"
}

// qualifySystem is the compact expert prompt for lead qualification.
const qualifySystem = `You are the lead qualification engine of a home-services company (roofing, repairs, replacements).
Judge each lead and reply with ONLY a JSON object, no prose, no markdown fences.
Schema:
{"score": <integer 0-100>, "intent": "buy|repair|replace|question|reschedule|cancel|optout|unknown", "urgency": "high|medium|low", "summary": "<one sentence>", "reasoning": "<short reason>", "suggestedActions": ["<action>", ...]}
Scoring guidance: 90-100 ready-to-buy with budget and timeline; 70-89 strong intent (clear problem, asked for service); 40-69 researching/curious; 10-39 weak signals; 0-8 spam or opt-out. Weight: explicit service request > budget/timeline mention > urgency words > contact completeness. Respect opt-outs with score 0 and intent "optout".`

// QualifyLead asks the brain to judge a lead. When the model is unavailable
// or returns garbage, a deterministic heuristic verdict is returned instead
// (source="heuristic") so the pipeline never stalls on AI flakiness.
func (c *Client) QualifyLead(ctx context.Context, in LeadInput) (*Verdict, error) {
	payload, err := json.Marshal(in)
	if err != nil {
		return nil, err
	}
	res, err := c.Chat(ctx, qualifySystem, string(payload), 0.2, 400)
	if err != nil {
		v := heuristicVerdict(&in)
		return v, nil
	}
	v, perr := parseVerdict(res.Text)
	if perr != nil {
		v = heuristicVerdict(&in)
		return v, nil
	}
	v.Source = "ai"
	clampVerdict(v)
	return v, nil
}

// parseVerdict extracts the verdict object from a model completion.
func parseVerdict(text string) (*Verdict, error) {
	raw, ok := extractJSON(text)
	if !ok {
		return nil, fmt.Errorf("ai: no JSON object in completion")
	}
	var v Verdict
	if err := json.Unmarshal(raw, &v); err != nil {
		return nil, fmt.Errorf("ai: verdict schema mismatch: %w", err)
	}
	return &v, nil
}

// clampVerdict enforces output contracts regardless of model drift.
func clampVerdict(v *Verdict) {
	if v.Score < 0 {
		v.Score = 0
	}
	if v.Score > 100 {
		v.Score = 100
	}
	switch strings.ToLower(v.Urgency) {
	case "high", "medium", "low":
		v.Urgency = strings.ToLower(v.Urgency)
	default:
		v.Urgency = "medium"
	}
	if v.Intent == "" {
		v.Intent = "unknown"
	}
	if len(v.SuggestedActions) > 5 {
		v.SuggestedActions = v.SuggestedActions[:5]
	}
}

// heuristicVerdict is the deterministic fallback: keyword scoring over the
// same axes the prompt describes. It mirrors the intent classifier in the
// pipeline and the scorer's thresholds.
func heuristicVerdict(in *LeadInput) *Verdict {
	text := strings.ToLower(strings.Join([]string{in.Message, in.Stage, strings.Join(in.Tags, " "), mapToText(in.Custom)}, " "))
	v := &Verdict{Source: "heuristic"}

	switch {
	case containsAny(text, "stop", "unsubscribe", "remove me", "do not text"):
		v.Score, v.Intent, v.Urgency = 0, "optout", "high"
		v.Summary = "Contact requested to stop contact."
		return v
	case containsAny(text, "replace", "new roof", "re-roof", "full roof"):
		v.Score, v.Intent, v.Urgency = 78, "replace", "high"
		v.Summary = "Replacement-scale job signal detected."
	case containsAny(text, "leak", "repair", "fix", "damage", "emergency"):
		v.Score, v.Intent, v.Urgency = 72, "repair", "high"
		v.Summary = "Repair-intent signal detected."
	case containsAny(text, "quote", "price", "cost", "estimate"):
		v.Score, v.Intent, v.Urgency = 64, "buy", "medium"
		v.Summary = "Pricing inquiry — warm buying signal."
	case containsAny(text, "reschedul", "move my", "change my"):
		v.Score, v.Intent, v.Urgency = 70, "reschedule", "medium"
		v.Summary = "Scheduling change requested."
	case containsAny(text, "confirm", "see you", "sounds good"):
		v.Score, v.Intent, v.Urgency = 75, "confirm", "low"
		v.Summary = "Appointment confirmation detected."
	default:
		v.Score, v.Intent, v.Urgency = 35, "question", "low"
		v.Summary = "General inquiry without strong signals."
	}

	// Completeness nudges.
	if in.Phone != "" {
		v.Score += 4
	}
	if in.Email != "" {
		v.Score += 3
	}
	if in.Value > 0 {
		v.Score += 5
	}
	if v.Score > 100 {
		v.Score = 100
	}
	v.Reasoning = "keyword heuristic (no model available)"
	v.SuggestedActions = []string{"follow_up_within_24h"}
	return v
}

// mapToText flattens the custom answers map for keyword scanning.
func mapToText(m map[string]string) string {
	if len(m) == 0 {
		return ""
	}
	parts := make([]string, 0, len(m))
	for k, val := range m {
		parts = append(parts, k, val)
	}
	return strings.Join(parts, " ")
}

func containsAny(s string, subs ...string) bool {
	for _, sub := range subs {
		if sub != "" && strings.Contains(s, sub) {
			return true
		}
	}
	return false
}
