// Package rules implements the declarative lead-routing ruleset: operators
// describe match conditions and effects as JSON, the engine compiles them
// into fast matchers evaluated on every canonical event. Rules sit between
// deterministic planning (pipeline.Plan) and provider execution
// (ghlapi.Executor), letting the business tune behavior without redeploys.
package rules

import (
	"encoding/json"
	"fmt"
	"sort"
	"strings"
	"sync"
)

// Match describes when a rule fires. Empty lists are wildcards for that
// dimension; PayloadAll requires every key/value to be present.
type Match struct {
	Events     []string          `json:"events,omitempty"`     // canonical types (wildcard if empty)
	Tags       []string          `json:"tags,omitempty"`       // any-of on event tag
	Stages     []string          `json:"stages,omitempty"`     // any-of on opportunity stage name
	MinScore   int               `json:"minScore,omitempty"`   // inclusive lower bound
	MaxScore   int               `json:"maxScore,omitempty"`   // inclusive upper bound (0 = unbounded)
	PayloadAll map[string]string `json:"payloadAll,omitempty"` // all must match
}

// Effects describes what happens when a rule matches.
type Effects struct {
	AddTags       []string `json:"addTags,omitempty"`
	RemoveTags    []string `json:"removeTags,omitempty"`
	WorkflowID    string   `json:"workflowId,omitempty"`
	NotifyUserIDs []string `json:"notifyUserIds,omitempty"`
	AddNote       string   `json:"addNote,omitempty"`
	SkipDefault   bool     `json:"skipDefault,omitempty"`   // suppress default planned actions
	PriorityBoost int      `json:"priorityBoost,omitempty"` // shift priority by -n (more urgent)
}

// Rule is one routing entry.
type Rule struct {
	ID          string  `json:"id"`
	Name        string  `json:"name"`
	Description string  `json:"description,omitempty"`
	Priority    int     `json:"priority,omitempty"` // lower evaluates first
	Enabled     bool    `json:"enabled"`
	Match       Match   `json:"match"`
	Effects     Effects `json:"effects"`

	// stats (runtime)
	matched uint64
}

// Set is the compiled ruleset with evaluation statistics.
type Set struct {
	mu    sync.RWMutex
	rules []Rule
	nowFn func() int64
}

// DefaultSet returns the built-in ruleset used when operators provide none.
func DefaultSet() *Set {
	rules := []Rule{
		{
			ID:          "hot-lead-fast-track",
			Name:        "Hot lead fast track",
			Description: "Score >= 80: enroll in the speed-to-lead workflow and bump priority.",
			Priority:    10,
			Enabled:     true,
			Match:       Match{MinScore: 80},
			Effects: Effects{
				AddTags:       []string{"hot-lead"},
				WorkflowID:    "speed-to-lead",
				PriorityBoost: 1,
				AddNote:       "Hot lead detected — fast track engaged.",
			},
		},
		{
			ID:          "optout-shield",
			Name:        "Opt-out shield",
			Description: "Any opt-out intent hardens suppression regardless of other rules.",
			Priority:    0,
			Enabled:     true,
			Match:       Match{Events: []string{"message.inbound"}},
			Effects: Effects{
				AddTags:     []string{"opted-out", "do-not-contact"},
				SkipDefault: true,
				AddNote:     "Opt-out shield enforced by ruleset.",
			},
		},
		{
			ID:          "warm-nurture",
			Name:        "Warm nurture",
			Description: "Mid-funnel leads enter the standard nurture cadence.",
			Priority:    20,
			Enabled:     true,
			Match:       Match{MinScore: 45, MaxScore: 79},
			Effects: Effects{
				AddTags:    []string{"nurture-warm"},
				WorkflowID: "nurture-30d",
			},
		},
		{
			ID:          "won-celebrate",
			Name:        "Won deal follow-through",
			Description: "Won opportunities get review-request + referral tags.",
			Priority:    15,
			Enabled:     true,
			Match:       Match{Stages: []string{"won", "closed won", "job complete"}},
			Effects: Effects{
				AddTags: []string{"review-request", "referral-candidate"},
			},
		},
	}
	for i := range rules {
		rules[i].normalize()
	}
	return &Set{rules: rules, nowFn: mono}
}

func mono() int64 { return 0 }

// normalize sorts stages/tags to lowercase for tolerant matching.
func (r *Rule) normalize() {
	for i, t := range r.Match.Tags {
		r.Match.Tags[i] = strings.ToLower(strings.TrimSpace(t))
	}
	for i, s := range r.Match.Stages {
		r.Match.Stages[i] = strings.ToLower(strings.TrimSpace(s))
	}
	for i, e := range r.Match.Events {
		r.Match.Events[i] = strings.ToLower(strings.TrimSpace(e))
	}
}

// Parse compiles a ruleset from JSON (replacing the current one).
func (s *Set) Parse(raw []byte) error {
	var incoming []Rule
	if err := json.Unmarshal(raw, &incoming); err != nil {
		return fmt.Errorf("rules: parse: %w", err)
	}
	if len(incoming) == 0 {
		return fmt.Errorf("rules: empty ruleset")
	}
	for i := range incoming {
		if incoming[i].ID == "" {
			return fmt.Errorf("rules: rule %d missing id", i)
		}
		if incoming[i].Name == "" {
			return fmt.Errorf("rules: rule %q missing name", incoming[i].ID)
		}
		incoming[i].normalize()
	}
	sort.SliceStable(incoming, func(i, j int) bool {
		if incoming[i].Priority != incoming[j].Priority {
			return incoming[i].Priority < incoming[j].Priority
		}
		return incoming[i].ID < incoming[j].ID
	})

	s.mu.Lock()
	s.rules = incoming
	s.mu.Unlock()
	return nil
}

// Replace swaps the entire ruleset programmatically.
func (s *Set) Replace(rules []Rule) error {
	for i := range rules {
		if rules[i].ID == "" {
			return fmt.Errorf("rules: rule %d missing id", i)
		}
		rules[i].normalize()
	}
	sort.SliceStable(rules, func(i, j int) bool {
		if rules[i].Priority != rules[j].Priority {
			return rules[i].Priority < rules[j].Priority
		}
		return rules[i].ID < rules[j].ID
	})
	s.mu.Lock()
	s.rules = rules
	s.mu.Unlock()
	return nil
}

// All returns a snapshot of the ruleset (with current stats).
func (s *Set) All() []Rule {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]Rule, len(s.rules))
	copy(out, s.rules)
	return out
}

// Count reports the number of active rules.
func (s *Set) Count() int {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return len(s.rules)
}

// Reset clears match statistics (exposed for admin tooling).
func (s *Set) Reset() {
	s.mu.Lock()
	for i := range s.rules {
		s.rules[i].matched = 0
	}
	s.mu.Unlock()
}
