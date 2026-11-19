package pg

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/faisukhan01/convert/services/engine-go/internal/action"
)

// InsertAction persists the execution record of one automation intent so
// operators can audit every send the engine ever made.
func (s *Store) InsertAction(ctx context.Context, a action.Action, status, errText string) error {
	payload := []byte("{}")
	if len(a.Payload) > 0 {
		if b, err := json.Marshal(a.Payload); err == nil {
			payload = b
		}
	}
	_, err := s.pool.Exec(ctx, `
		INSERT INTO engine_actions
			(kind, location_id, contact_id, dedupe_key, priority, payload, reason, status, error)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
		a.Kind, a.LocationID, a.ContactID, a.DedupeKey, a.Priority, payload, a.Reason, status, errText,
	)
	if err != nil {
		return fmt.Errorf("pg: insert action: %w", err)
	}
	return nil
}

// ActionRow is one audit record for listing.
type ActionRow struct {
	ID        int64             `json:"id"`
	Kind      string            `json:"kind"`
	Location  string            `json:"locationId"`
	Contact   string            `json:"contactId,omitempty"`
	Status    string            `json:"status"`
	Error     string            `json:"error,omitempty"`
	Reason    string            `json:"reason,omitempty"`
	CreatedAt string            `json:"createdAt"`
	Payload   map[string]string `json:"payload,omitempty"`
}

// ListActions returns recent action audit records, newest first.
func (s *Store) ListActions(ctx context.Context, limit int, kind string) ([]ActionRow, error) {
	if limit <= 0 || limit > 500 {
		limit = 50
	}
	rows, err := s.pool.Query(ctx, `
		SELECT id, kind, location_id, contact_id, status, error, reason,
		       to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), payload
		FROM engine_actions
		WHERE ($1 = '' OR kind = $1)
		ORDER BY id DESC
		LIMIT $2`, kind, limit)
	if err != nil {
		return nil, fmt.Errorf("pg: list actions: %w", err)
	}
	defer rows.Close()

	out := make([]ActionRow, 0, limit)
	for rows.Next() {
		var r ActionRow
		var payloadRaw []byte
		if err := rows.Scan(&r.ID, &r.Kind, &r.Location, &r.Contact, &r.Status, &r.Error,
			&r.Reason, &r.CreatedAt, &payloadRaw); err != nil {
			return nil, fmt.Errorf("pg: scan action: %w", err)
		}
		if len(payloadRaw) > 2 {
			_ = json.Unmarshal(payloadRaw, &r.Payload)
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

// CountActionsByKind aggregates the action histogram for dashboards.
func (s *Store) CountActionsByKind(ctx context.Context) (map[string]int, error) {
	rows, err := s.pool.Query(ctx, `SELECT kind, COUNT(*) FROM engine_actions GROUP BY kind`)
	if err != nil {
		return nil, fmt.Errorf("pg: count actions: %w", err)
	}
	defer rows.Close()

	out := make(map[string]int, 16)
	for rows.Next() {
		var kind string
		var n int
		if err := rows.Scan(&kind, &n); err != nil {
			return nil, err
		}
		out[kind] = n
	}
	return out, rows.Err()
}

// ActionTotals returns (total, failed) action counts.
func (s *Store) ActionTotals(ctx context.Context) (total int, failed int, err error) {
	err = s.pool.QueryRow(ctx, `
		SELECT COUNT(*), COUNT(*) FILTER (WHERE status = 'failed')
		FROM engine_actions`).Scan(&total, &failed)
	if err != nil {
		return 0, 0, fmt.Errorf("pg: action totals: %w", err)
	}
	return total, failed, nil
}
