// Package store holds the engine's in-memory projection: the latest state
// per contact, per location. It is intentionally minimal — a queryable
// mirror for /v1/stats and operational debugging. Source of truth remains
// Postgres (the Next.js app owns writes; the engine owns the hot path).
package store

import (
	"sync"
	"time"

	"github.com/faisukhan01/convert/services/engine-go/internal/pipeline"
)

// ContactState is the projection unit.
type ContactState struct {
	LocationID   string    `json:"locationId"`
	ContactID    string    `json:"contactId"`
	Name         string    `json:"name,omitempty"`
	Email        string    `json:"email,omitempty"`
	Phone        string    `json:"phone,omitempty"`
	LastEvent    string    `json:"lastEvent"`
	LastSeen     time.Time `json:"lastSeen"`
	Appointments int       `json:"appointments"`
	Messages     int       `json:"messages"`
	OptedOut     bool      `json:"optedOut"`
}

// MemStore is the thread-safe projection store.
type MemStore struct {
	mu       sync.RWMutex
	contacts map[string]*ContactState // key: locationID|contactID
	events   map[string]int           // canonical event counts
	started  time.Time
}

// New creates an empty store.
func New() *MemStore {
	return &MemStore{
		contacts: make(map[string]*ContactState),
		events:   make(map[string]int),
		started:  time.Now(),
	}
}

// Apply folds a canonical event into the projection.
func (s *MemStore) Apply(c *pipeline.Canonical) {
	if c == nil || c.LocationID == "" {
		return
	}
	key := c.LocationID + "|"
	if c.ContactID != "" {
		key += c.ContactID
	} else {
		key += c.Contact.Name
	}

	s.mu.Lock()
	defer s.mu.Unlock()
	st, ok := s.contacts[key]
	if !ok {
		st = &ContactState{LocationID: c.LocationID, ContactID: c.ContactID, Name: c.Contact.Name,
			Email: c.Contact.Email, Phone: c.Contact.Phone, LastSeen: c.ObservedAt}
		s.contacts[key] = st
	}
	st.LastEvent = c.Type
	st.LastSeen = c.ObservedAt
	s.events[c.Type]++

	switch c.Type {
	case "appointment.created", "appointment.status_changed", "appointment.no_show":
		st.Appointments++
	case "message.inbound":
		st.Messages++
	}
}

// OptOut marks a contact as opted out (hard stop).
func (s *MemStore) OptOut(locationID, contactID string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	key := locationID + "|" + contactID
	if st, ok := s.contacts[key]; ok {
		st.OptedOut = true
	}
}

// List returns up to n contact states ordered by most recently seen.
func (s *MemStore) List(n int) []ContactState {
	s.mu.RLock()
	defer s.mu.RUnlock()
	all := make([]ContactState, 0, len(s.contacts))
	for _, st := range s.contacts {
		all = append(all, *st)
	}
	// insertion-order sort by LastSeen desc (small n; fine without heap)
	for i := 1; i < len(all); i++ {
		for j := i; j > 0 && all[j].LastSeen.After(all[j-1].LastSeen); j-- {
			all[j], all[j-1] = all[j-1], all[j]
		}
	}
	if n > 0 && len(all) > n {
		all = all[:n]
	}
	return all
}

// EventCounts returns the canonical-event histogram.
func (s *MemStore) EventCounts() map[string]int {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make(map[string]int, len(s.events))
	for k, v := range s.events {
		out[k] = v
	}
	return out
}

// Contacts reports projection size and uptime.
func (s *MemStore) Contacts() (int, time.Duration) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return len(s.contacts), time.Since(s.started)
}

// OptedOutCount reports how many contacts hit the hard stop.
func (s *MemStore) OptedOutCount() int {
	s.mu.RLock()
	defer s.mu.RUnlock()
	n := 0
	for _, st := range s.contacts {
		if st.OptedOut {
			n++
		}
	}
	return n
}
