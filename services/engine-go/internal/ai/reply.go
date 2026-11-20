package ai

import (
	"context"
	"strings"
)

// ReplyInput is the drafting context for an outbound reply.
type ReplyInput struct {
	Channel     string `json:"channel"`               // sms | email
	Contact     string `json:"contact"`               // first name if known
	Intent      string `json:"intent"`                // qualification intent
	Appointment string `json:"appointment,omitempty"` // RFC3339 start if scheduled
	Service     string `json:"service,omitempty"`     // repair | replacement | inspection
	Notes       string `json:"notes,omitempty"`       // last inbound message / context
}

// replySystem is the compliance-aware drafting prompt.
const replySystem = `You draft outbound messages for a home-services company. Rules:
1. NEVER text/email contacts who opted out — if the context says optout, return exactly: BLOCKED
2. SMS: under 320 characters, no links except the reschedule link placeholder {{reschedule_link}}, plain text.
3. Email: 60-120 words, one clear call to action.
4. Tone: friendly, professional, concise. Address the contact by first name if provided.
Return ONLY the message body text with no quotes and no explanations.`

// DraftReply generates a ready-to-send message. It returns (text, blocked, err).
// When the model is unavailable a deterministic template reply is composed so
// the flow still completes (blocked=false).
func (c *Client) DraftReply(ctx context.Context, in ReplyInput) (string, bool, error) {
	res, err := c.Chat(ctx, replySystem, marshalReplyInput(in), 0.4, 300)
	if err == nil {
		text := strings.TrimSpace(res.Text)
		if strings.EqualFold(text, "BLOCKED") {
			return "", true, nil
		}
		if text != "" {
			return clampReply(in.Channel, text), false, nil
		}
	}
	// Deterministic fallback.
	return templateReply(in), false, nil
}

// marshalReplyInput flattens the input into a compact JSON context string.
func marshalReplyInput(in ReplyInput) string {
	var b strings.Builder
	b.WriteString(`{"channel":"` + in.Channel + `"`)
	if in.Contact != "" {
		b.WriteString(`,"firstName":"` + jsonEscape(in.Contact) + `"`)
	}
	if in.Intent != "" {
		b.WriteString(`,"intent":"` + jsonEscape(in.Intent) + `"`)
	}
	if in.Appointment != "" {
		b.WriteString(`,"appointmentStart":"` + jsonEscape(in.Appointment) + `"`)
	}
	if in.Service != "" {
		b.WriteString(`,"service":"` + jsonEscape(in.Service) + `"`)
	}
	if in.Notes != "" {
		b.WriteString(`,"context":"` + jsonEscape(in.Notes) + `"`)
	}
	b.WriteString("}")
	return b.String()
}

// clampReply enforces channel length limits on model output.
func clampReply(channel, text string) string {
	if channel == "sms" && len(text) > 480 {
		cut := text[:480]
		if i := strings.LastIndexAny(cut, ". !?"); i > 200 {
			cut = cut[:i+1]
		}
		return strings.TrimSpace(cut)
	}
	return text
}

// templateReply is the deterministic fallback copy per intent.
func templateReply(in ReplyInput) string {
	name := in.Contact
	hi := "Hi there"
	if name != "" {
		hi = "Hi " + strings.SplitN(name, " ", 2)[0]
	}
	switch in.Intent {
	case "optout":
		return "BLOCKED"
	case "reschedule":
		return hi + "! No problem at all — use {{reschedule_link}} whenever works best for you. Talk soon."
	case "confirm":
		return hi + "! You're all set — we'll see you at your appointment. Reply here if anything changes."
	case "replace", "repair":
		return hi + "! Thanks for reaching out about your " + orDefault(in.Service, "roofing") + " project. We'll put together a clear estimate and send it your way shortly."
	default:
		return hi + "! Thanks for getting in touch — what can we help you with?"
	}
}

func orDefault(v, def string) string {
	if strings.TrimSpace(v) == "" {
		return def
	}
	return v
}

// jsonEscape escapes a string for embedding in a hand-built JSON doc.
func jsonEscape(s string) string {
	r := strings.NewReplacer("\\", "\\\\", "\"", "\\\"", "\n", "\\n", "\r", "", "\t", "\\t")
	return r.Replace(s)
}
