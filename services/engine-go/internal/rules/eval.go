package rules

import (
	"fmt"
	"strconv"
	"strings"

	"github.com/faisukhan01/convert/services/engine-go/internal/pipeline"
)

// Context is everything a rule can inspect at evaluation time.
type Context struct {
	Event *pipeline.Canonical
	Score int
}

// Outcome is a matched rule plus its resolved effects.
type Outcome struct {
	RuleID   string
	RuleName string
	Effects  Effects
}

// Evaluate runs the ruleset against the context in priority order and
// returns every matching rule's outcome. Bumped counters make evaluation
// observable through /v1/rules.
func (s *Set) Evaluate(ctx Context) []Outcome {
	if ctx.Event == nil {
		return nil
	}
	s.mu.Lock()
	defer s.mu.Unlock()

	out := make([]Outcome, 0, 2)
	for i := range s.rules {
		r := &s.rules[i]
		if !r.Enabled || !r.matches(&ctx) {
			continue
		}
		r.matched++
		out = append(out, Outcome{RuleID: r.ID, RuleName: r.Name, Effects: r.Effects})
	}
	return out
}

// ShouldSkipDefault reports whether any matched rule suppresses the default
// planned actions (e.g. the opt-out shield).
func (s *Set) ShouldSkipDefault(ctx Context) bool {
	for _, o := range s.Evaluate(ctx) {
		if o.Effects.SkipDefault {
			return true
		}
	}
	return false
}

// matches implements the all-dimensions-must-pass matcher.
func (r *Rule) matches(c *Context) bool {
	m := &r.Match

	// Event type dimension.
	if len(m.Events) > 0 && !containsFold(m.Events, c.Event.Type) {
		return false
	}

	// Tag dimension (fires only when the event carries a tag and it matches).
	if len(m.Tags) > 0 {
		if c.Event.Tag == "" || !containsFold(m.Tags, c.Event.Tag) {
			return false
		}
	}

	// Stage dimension.
	if len(m.Stages) > 0 {
		if c.Event.Opportunity == nil || !containsFold(m.Stages, c.Event.Opportunity.StageName) {
			return false
		}
	}

	// Score band dimension.
	if m.MinScore > 0 && c.Score < m.MinScore {
		return false
	}
	if m.MaxScore > 0 && c.Score > m.MaxScore {
		return false
	}

	// Payload dimension (every listed key/value must match).
	if len(m.PayloadAll) > 0 {
		for k, want := range m.PayloadAll {
			got, ok := c.Event.Custom[k]
			if !ok || !strings.EqualFold(toStr(got), want) {
				return false
			}
		}
	}
	return true
}

// containsFold is a case-insensitive any-of.
func containsFold(list []string, v string) bool {
	for _, item := range list {
		if strings.EqualFold(strings.TrimSpace(item), strings.TrimSpace(v)) {
			return true
		}
	}
	return false
}

// toStr stringifies a custom-data value for comparison.
func toStr(v any) string {
	switch t := v.(type) {
	case string:
		return t
	case bool:
		if t {
			return "true"
		}
		return "false"
	case int:
		return strconv.Itoa(t)
	case float64:
		return strconv.FormatFloat(t, 'f', -1, 64)
	case nil:
		return ""
	default:
		return strings.TrimSpace(fmt.Sprint(t))
	}
}
