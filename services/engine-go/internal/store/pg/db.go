// Package pg is the PostgreSQL persistence layer of the RidgeLine Go
// engine. It mirrors the journal, the contact projection and the action log
// into durable tables so the TypeScript app and the Go engine share one
// source of truth, and so operators can replay long windows without holding
// everything in memory.
//
// Connection management uses pgxpool (github.com/jackc/pgx/v5). Schema
// migrations are embedded and idempotent: Migrate is safe to call on every
// boot and cheap after the first run.
package pg

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// Store is the durable sink. All methods are safe for concurrent use.
type Store struct {
	pool *pgxpool.Pool
}

// Options tunes the pool.
type Options struct {
	// MaxConns caps pool size (default 8).
	MaxConns int32
	// MinConns keeps warm connections (default 1).
	MinConns int32
	// ConnectTimeout bounds the initial dial (default 5s).
	ConnectTimeout time.Duration
}

// Open connects and pings. The DSN may be a URL
// (postgres://user:pass@host:5432/db) or a keyword/value string.
func Open(ctx context.Context, dsn string, opts Options) (*Store, error) {
	if dsn == "" {
		return nil, errors.New("pg: empty DATABASE_URL")
	}
	if opts.MaxConns <= 0 {
		opts.MaxConns = 8
	}
	if opts.MinConns <= 0 {
		opts.MinConns = 1
	}
	if opts.ConnectTimeout <= 0 {
		opts.ConnectTimeout = 5 * time.Second
	}

	cfg, err := pgxpool.ParseConfig(dsn)
	if err != nil {
		return nil, fmt.Errorf("pg: parse dsn: %w", err)
	}
	cfg.MaxConns = opts.MaxConns
	cfg.MinConns = opts.MinConns
	cfg.ConnConfig.ConnectTimeout = opts.ConnectTimeout

	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		return nil, fmt.Errorf("pg: connect: %w", err)
	}
	pingCtx, cancel := context.WithTimeout(ctx, opts.ConnectTimeout)
	defer cancel()
	if err := pool.Ping(pingCtx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("pg: ping: %w", err)
	}
	return &Store{pool: pool}, nil
}

// Close releases the pool.
func (s *Store) Close() {
	if s != nil && s.pool != nil {
		s.pool.Close()
	}
}

// Ping verifies connectivity with a context deadline.
func (s *Store) Ping(ctx context.Context) error {
	if s == nil || s.pool == nil {
		return errors.New("pg: store not open")
	}
	return s.pool.Ping(ctx)
}

// migrations is the ordered, idempotent schema program. Each entry runs once
// per schema_version row; new entries append and apply on next boot.
var migrations = []string{
	// v1: core tables.
	`CREATE TABLE IF NOT EXISTS engine_events (
                seq          BIGSERIAL PRIMARY KEY,
                event_id     TEXT NOT NULL,
                event_type   TEXT NOT NULL,
                location_id  TEXT NOT NULL DEFAULT '',
                status       TEXT NOT NULL,
                detail       TEXT NOT NULL DEFAULT '',
                payload      JSONB NOT NULL DEFAULT '{}'::jsonb,
                attempts     INT NOT NULL DEFAULT 0,
                received_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
                updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
        )`,
	`CREATE TABLE IF NOT EXISTS engine_contacts (
                location_id  TEXT NOT NULL,
                contact_id   TEXT NOT NULL,
                name         TEXT NOT NULL DEFAULT '',
                email        TEXT NOT NULL DEFAULT '',
                phone        TEXT NOT NULL DEFAULT '',
                last_event   TEXT NOT NULL DEFAULT '',
                last_seen    TIMESTAMPTZ NOT NULL DEFAULT now(),
                appointments INT NOT NULL DEFAULT 0,
                messages     INT NOT NULL DEFAULT 0,
                opted_out    BOOLEAN NOT NULL DEFAULT FALSE,
                PRIMARY KEY (location_id, contact_id)
        )`,
	`CREATE TABLE IF NOT EXISTS engine_actions (
                id           BIGSERIAL PRIMARY KEY,
                kind         TEXT NOT NULL,
                location_id  TEXT NOT NULL,
                contact_id   TEXT NOT NULL DEFAULT '',
                dedupe_key   TEXT NOT NULL DEFAULT '',
                priority     INT NOT NULL DEFAULT 2,
                payload      JSONB NOT NULL DEFAULT '{}'::jsonb,
                reason       TEXT NOT NULL DEFAULT '',
                status       TEXT NOT NULL,
                error        TEXT NOT NULL DEFAULT '',
                created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
        )`,
	`CREATE TABLE IF NOT EXISTS engine_meta (
                key   TEXT PRIMARY KEY,
                value TEXT NOT NULL
        )`,
	// v1: indexes for the hot operator queries.
	`CREATE INDEX IF NOT EXISTS idx_engine_events_status ON engine_events (status, seq DESC)`,
	`CREATE INDEX IF NOT EXISTS idx_engine_events_location ON engine_events (location_id, seq DESC)`,
	`CREATE INDEX IF NOT EXISTS idx_engine_actions_created ON engine_actions (created_at DESC)`,
	`CREATE INDEX IF NOT EXISTS idx_engine_actions_kind ON engine_actions (kind, created_at DESC)`,
	`CREATE UNIQUE INDEX IF NOT EXISTS idx_engine_events_dedupe ON engine_events (event_id) WHERE event_id <> ''`,
}

// Migrate applies pending schema migrations inside a single transaction.
func (s *Store) Migrate(ctx context.Context) error {
	if _, err := s.pool.Exec(ctx, `CREATE TABLE IF NOT EXISTS schema_migrations (
                version INT PRIMARY KEY,
                applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )`); err != nil {
		return fmt.Errorf("pg: ensure schema_migrations: %w", err)
	}

	var current int
	if err := s.pool.QueryRow(ctx,
		`SELECT COALESCE(MAX(version), 0) FROM schema_migrations`).Scan(&current); err != nil {
		return fmt.Errorf("pg: read schema version: %w", err)
	}

	for i := current; i < len(migrations); i++ {
		tx, err := s.pool.Begin(ctx)
		if err != nil {
			return fmt.Errorf("pg: begin migration %d: %w", i+1, err)
		}
		if _, err := tx.Exec(ctx, migrations[i]); err != nil {
			_ = tx.Rollback(ctx)
			return fmt.Errorf("pg: apply migration %d: %w", i+1, err)
		}
		if _, err := tx.Exec(ctx,
			`INSERT INTO schema_migrations (version) VALUES ($1)`, i+1); err != nil {
			_ = tx.Rollback(ctx)
			return fmt.Errorf("pg: stamp migration %d: %w", i+1, err)
		}
		if err := tx.Commit(ctx); err != nil {
			return fmt.Errorf("pg: commit migration %d: %w", i+1, err)
		}
	}
	return nil
}

// Stats returns pool health for /v1/stats.
func (s *Store) Stats(ctx context.Context) map[string]any {
	if s == nil || s.pool == nil {
		return map[string]any{"connected": false}
	}
	st := s.pool.Stat()
	out := map[string]any{
		"connected":     true,
		"totalConns":    st.TotalConns(),
		"idleConns":     st.IdleConns(),
		"acquiredConns": st.AcquiredConns(),
		"maxConns":      st.MaxConns(),
		"totalAcquires": st.AcquireCount(),
	}
	if err := s.pool.Ping(ctx); err != nil {
		out["healthy"] = false
	} else {
		out["healthy"] = true
	}
	return out
}
