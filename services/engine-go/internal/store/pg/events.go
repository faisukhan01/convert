package pg

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"

	"github.com/faisukhan01/convert/services/engine-go/internal/eventlog"
)

// InsertEvent persists one journal event. Duplicate event ids are tolerated
// (ON CONFLICT DO NOTHING) so replay-safe writers can push blindly.
func (s *Store) InsertEvent(ctx context.Context, e *eventlog.Event) error {
	payload := []byte("{}")
	if e.Payload != nil {
		if b, err := json.Marshal(e.Payload); err == nil {
			payload = b
		}
	}
	tag, err := s.pool.Exec(ctx, `
		INSERT INTO engine_events
			(event_id, event_type, location_id, status, detail, payload, attempts, received_at, updated_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
		ON CONFLICT (event_id) WHERE event_id <> '' DO NOTHING`,
		e.ID, e.Type, e.LocationID, string(e.Status), e.Detail, payload, e.Attempts, e.ReceivedAt, e.UpdatedAt,
	)
	if err != nil {
		return fmt.Errorf("pg: insert event: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrDuplicateEvent
	}
	return nil
}

// ErrDuplicateEvent signals an idempotent insert that matched an existing row.
var ErrDuplicateEvent = errors.New("pg: duplicate event id")

// UpdateEventStatus transitions a persisted event to a new journal state.
func (s *Store) UpdateEventStatus(ctx context.Context, seq uint64, status eventlog.Status, detail string) error {
	_, err := s.pool.Exec(ctx, `
		UPDATE engine_events SET status = $2, detail = $3, updated_at = now()
		WHERE seq = $1`,
		seq, string(status), detail,
	)
	if err != nil {
		return fmt.Errorf("pg: update event status: %w", err)
	}
	return nil
}

// ListEvents returns persisted events in descending sequence order.
func (s *Store) ListEvents(ctx context.Context, limit int, status eventlog.Status) ([]eventlog.Event, error) {
	if limit <= 0 || limit > 1000 {
		limit = 100
	}
	rows, err := s.pool.Query(ctx, `
		SELECT seq, event_id, event_type, location_id, status, detail, payload, attempts, received_at, updated_at
		FROM engine_events
		WHERE ($1 = '' OR status = $1)
		ORDER BY seq DESC
		LIMIT $2`,
		string(status), limit,
	)
	if err != nil {
		return nil, fmt.Errorf("pg: list events: %w", err)
	}
	defer rows.Close()

	out := make([]eventlog.Event, 0, limit)
	for rows.Next() {
		var e eventlog.Event
		var statusStr, payloadRaw []byte
		if err := rows.Scan(&e.Seq, &e.ID, &e.Type, &e.LocationID, &statusStr, &e.Detail,
			&payloadRaw, &e.Attempts, &e.ReceivedAt, &e.UpdatedAt); err != nil {
			return nil, fmt.Errorf("pg: scan event: %w", err)
		}
		e.Status = eventlog.Status(statusStr)
		if len(payloadRaw) > 0 {
			_ = json.Unmarshal(payloadRaw, &e.Payload)
		}
		out = append(out, e)
	}
	return out, rows.Err()
}

// CountEventsByStatus aggregates journal states.
func (s *Store) CountEventsByStatus(ctx context.Context) (map[string]int, error) {
	rows, err := s.pool.Query(ctx, `SELECT status, COUNT(*) FROM engine_events GROUP BY status`)
	if err != nil {
		return nil, fmt.Errorf("pg: count events: %w", err)
	}
	defer rows.Close()

	out := make(map[string]int, 8)
	for rows.Next() {
		var status string
		var n int
		if err := rows.Scan(&status, &n); err != nil {
			return nil, err
		}
		out[status] = n
	}
	return out, rows.Err()
}

// ReplayableEvents returns ids of events eligible for replay, capped by limit.
func (s *Store) ReplayableEvents(ctx context.Context, limit int) ([]eventlog.Event, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT seq, event_id, event_type, location_id, status, detail, received_at, updated_at
		FROM engine_events
		WHERE status IN ('FAILED','RATE_LIMITED','OUT_OF_ORDER')
		ORDER BY seq DESC
		LIMIT $1`, limit)
	if err != nil {
		return nil, fmt.Errorf("pg: replayable events: %w", err)
	}
	defer rows.Close()

	out := make([]eventlog.Event, 0, limit)
	for rows.Next() {
		var e eventlog.Event
		var statusStr string
		if err := rows.Scan(&e.Seq, &e.ID, &e.Type, &e.LocationID, &statusStr, &e.Detail,
			&e.ReceivedAt, &e.UpdatedAt); err != nil {
			return nil, err
		}
		e.Status = eventlog.Status(statusStr)
		out = append(out, e)
	}
	return out, rows.Err()
}

// MaxEventSeq returns the highest persisted sequence (for incremental sync).
func (s *Store) MaxEventSeq(ctx context.Context) (uint64, error) {
	var n int64
	if err := s.pool.QueryRow(ctx, `SELECT COALESCE(MAX(seq),0) FROM engine_events`).Scan(&n); err != nil {
		return 0, err
	}
	if n < 0 {
		n = 0
	}
	return uint64(n), nil
}
