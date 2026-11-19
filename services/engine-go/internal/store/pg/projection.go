package pg

import (
	"context"
	"fmt"
	"time"
)

// ContactRow is the durable projection of one contact's latest state.
type ContactRow struct {
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

// UpsertContact folds a contact projection into Postgres.
func (s *Store) UpsertContact(ctx context.Context, c ContactRow) error {
	_, err := s.pool.Exec(ctx, `
		INSERT INTO engine_contacts
			(location_id, contact_id, name, email, phone, last_event, last_seen, appointments, messages, opted_out)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
		ON CONFLICT (location_id, contact_id) DO UPDATE SET
			name        = EXCLUDED.name,
			email       = EXCLUDED.email,
			phone       = EXCLUDED.phone,
			last_event  = EXCLUDED.last_event,
			last_seen   = EXCLUDED.last_seen,
			appointments = engine_contacts.appointments + EXCLUDED.appointments,
			messages    = engine_contacts.messages + EXCLUDED.messages,
			opted_out   = engine_contacts.opted_out OR EXCLUDED.opted_out`,
		c.LocationID, c.ContactID, c.Name, c.Email, c.Phone, c.LastEvent, c.LastSeen,
		c.Appointments, c.Messages, c.OptedOut,
	)
	if err != nil {
		return fmt.Errorf("pg: upsert contact: %w", err)
	}
	return nil
}

// OptOutContact flips the hard-stop flag.
func (s *Store) OptOutContact(ctx context.Context, locationID, contactID string) error {
	_, err := s.pool.Exec(ctx, `
		UPDATE engine_contacts SET opted_out = TRUE
		WHERE location_id = $1 AND contact_id = $2`,
		locationID, contactID,
	)
	if err != nil {
		return fmt.Errorf("pg: opt out: %w", err)
	}
	return nil
}

// ListContacts returns the most recently seen contacts.
func (s *Store) ListContacts(ctx context.Context, limit int) ([]ContactRow, error) {
	if limit <= 0 || limit > 1000 {
		limit = 100
	}
	rows, err := s.pool.Query(ctx, `
		SELECT location_id, contact_id, name, email, phone, last_event, last_seen, appointments, messages, opted_out
		FROM engine_contacts
		ORDER BY last_seen DESC
		LIMIT $1`, limit)
	if err != nil {
		return nil, fmt.Errorf("pg: list contacts: %w", err)
	}
	defer rows.Close()

	out := make([]ContactRow, 0, limit)
	for rows.Next() {
		var c ContactRow
		if err := rows.Scan(&c.LocationID, &c.ContactID, &c.Name, &c.Email, &c.Phone,
			&c.LastEvent, &c.LastSeen, &c.Appointments, &c.Messages, &c.OptedOut); err != nil {
			return nil, fmt.Errorf("pg: scan contact: %w", err)
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

// ContactTotals returns (total, optedOut) counts.
func (s *Store) ContactTotals(ctx context.Context) (total int, optedOut int, err error) {
	err = s.pool.QueryRow(ctx, `
		SELECT COUNT(*), COUNT(*) FILTER (WHERE opted_out)
		FROM engine_contacts`).Scan(&total, &optedOut)
	if err != nil {
		return 0, 0, fmt.Errorf("pg: contact totals: %w", err)
	}
	return total, optedOut, nil
}
