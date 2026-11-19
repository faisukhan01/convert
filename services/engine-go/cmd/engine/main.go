// Command engine is the RidgeLine Go automation engine daemon: a
// high-performance webhook ingest + normalization + scoring + routing +
// action execution service with a GoHighLevel (GHL) API stack, a durable
// PostgreSQL store and a z.ai brain. It complements the Next.js application
// (the "Go/worker split").
//
//	$ ENGINE_PORT=8088 DATABASE_URL=postgres://... GHL_ACCESS_TOKEN=pit-... ./engine
//
// All configuration is environment-driven; see internal/config for the full
// inventory and docs/configuration-inventory.md for the operator reference.
package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"sync/atomic"
	"syscall"
	"time"

	"github.com/faisukhan01/convert/services/engine-go/internal/action"
	"github.com/faisukhan01/convert/services/engine-go/internal/ai"
	"github.com/faisukhan01/convert/services/engine-go/internal/config"
	"github.com/faisukhan01/convert/services/engine-go/internal/eventlog"
	"github.com/faisukhan01/convert/services/engine-go/internal/ghlapi"
	"github.com/faisukhan01/convert/services/engine-go/internal/logging"
	"github.com/faisukhan01/convert/services/engine-go/internal/metrics"
	"github.com/faisukhan01/convert/services/engine-go/internal/pipeline"
	"github.com/faisukhan01/convert/services/engine-go/internal/queue"
	"github.com/faisukhan01/convert/services/engine-go/internal/ratelimit"
	"github.com/faisukhan01/convert/services/engine-go/internal/rules"
	"github.com/faisukhan01/convert/services/engine-go/internal/scoring"
	"github.com/faisukhan01/convert/services/engine-go/internal/server"
	"github.com/faisukhan01/convert/services/engine-go/internal/store"
	"github.com/faisukhan01/convert/services/engine-go/internal/store/pg"
	"github.com/faisukhan01/convert/services/engine-go/internal/version"
)

func main() {
	cfg, err := config.FromEnv()
	if err != nil {
		slog.Error("invalid configuration", "err", err)
		os.Exit(1)
	}
	logger := logging.New(cfg.LogFormat, cfg.LogLevel)
	slog.SetDefault(logger)
	logger.Info("starting", "identity", version.Human(), "addr", cfg.ListenAddr,
		"secret", cfg.GuardedSecret(),
		"ghl", integrationState(cfg.HasGHL(), cfg.GHLDryRun),
		"postgres", boolState(cfg.HasDB()),
		"ai", boolState(cfg.HasAI()),
	)

	// Dependency graph:
	//   metrics → journal → queue → orchestrator → projection
	//   optional: postgres store, GHL executor, rules engine, scoring tracker, AI brain
	reg := metrics.NewRegistry()
	journal := eventlog.New(cfg.EventLogCapacity)

	q := queue.New(cfg.QueueCapacity, cfg.WorkerCount, cfg.MaxAttempts, cfg.BaseBackoff, cfg.MaxBackoff)
	proj := store.New()
	tracker := scoring.NewTracker()
	ruleset := rules.DefaultSet()
	if path := os.Getenv("ENGINE_RULES_FILE"); path != "" {
		if raw, rerr := os.ReadFile(path); rerr == nil {
			if perr := ruleset.Parse(raw); perr != nil {
				logger.Warn("rules file rejected; using built-in ruleset", "path", path, "err", perr)
			} else {
				logger.Info("ruleset loaded", "path", path, "count", ruleset.Count())
			}
		} else {
			logger.Warn("rules file unreadable; using built-in ruleset", "path", path, "err", rerr)
		}
	}

	// ── Optional: durable Postgres store ──────────────────────────────
	var dbStore *pg.Store
	if cfg.HasDB() {
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		dbStore, err = pg.Open(ctx, cfg.DatabaseURL, pg.Options{MaxConns: cfg.DBMaxConns})
		cancel()
		if err != nil {
			logger.Error("postgres unavailable; continuing without durable store", "err", err)
			dbStore = nil
		} else {
			mctx, mcancel := context.WithTimeout(context.Background(), 15*time.Second)
			if merr := dbStore.Migrate(mctx); merr != nil {
				logger.Error("postgres migration failed; continuing without durable store", "err", merr)
				dbStore.Close()
				dbStore = nil
			} else {
				logger.Info("postgres store ready", "maxConns", cfg.DBMaxConns)
			}
			mcancel()
		}
	}

	// ── Optional: GoHighLevel executor (dry-run without a token) ──────
	var exec *ghlapi.Executor
	var ghlClient *ghlapi.Client
	if cfg.GHLAccessToken != "" {
		opts := []ghlapi.Option{
			ghlapi.WithLocationID(cfg.GHLLocationID),
			ghlapi.WithMaxRetries(4),
			ghlapi.WithTimeout(15 * time.Second),
		}
		if cfg.GHLBaseURL != "" && cfg.GHLBaseURL != ghlapi.DefaultBaseURL {
			opts = append(opts, ghlapi.WithBase(cfg.GHLBaseURL))
		}
		ghlClient = ghlapi.NewClient(cfg.GHLAccessToken, opts...)
		exec = ghlapi.NewExecutor(ghlClient, reg, cfg.GHLDryRun)
		logger.Info("ghl executor ready", "dryRun", cfg.GHLDryRun, "location", cfg.GHLLocationID)
	} else {
		// Dry-run executor so /v1/ghl/status still reports honestly.
		ghlClient = ghlapi.NewClient("", ghlapi.WithLocationID(cfg.GHLLocationID))
		exec = ghlapi.NewExecutor(ghlClient, reg, true)
		logger.Info("ghl executor in dry-run (no GHL_ACCESS_TOKEN)")
	}

	// ── Optional: z.ai brain ──────────────────────────────────────────
	var brain *ai.Client
	if cfg.HasAI() {
		opts := []ai.Option{ai.WithModel(cfg.ZAIModel)}
		if cfg.ZAIBase != "" && cfg.ZAIBase != ai.DefaultBaseURL {
			opts = append(opts, ai.WithBase(cfg.ZAIBase))
		}
		brain = ai.NewClient(cfg.ZAIKey, opts...)
		logger.Info("ai brain ready", "model", brain.Model(), "key", brain.MaskedKey())
	} else {
		brain = ai.NewClient("")
		logger.Info("ai brain in heuristic mode (no ZAI_API_KEY)")
	}

	registerWorkers(q, proj, tracker, ruleset, exec, dbStore, reg, brain)

	orch := pipeline.NewOrchestrator(journal, q, reg)
	orch.Secret = cfg.WebhookSecret
	orch.RequireSig = cfg.RequireSignature

	limiter := ratelimit.New(cfg.RateLimitEventsPerMin, cfg.BurstMultiplier)

	srv := server.New(cfg, orch, q, limiter, proj, reg)
	srv.Attach(&server.Services{
		GHL:     exec,
		DB:      dbStore,
		Rules:   ruleset,
		Tracker: tracker,
		AI:      brain,
	})

	httpServer := &http.Server{
		Addr:         cfg.ListenAddr,
		Handler:      srv.Routes(),
		ReadTimeout:  cfg.ReadTimeout,
		WriteTimeout: cfg.WriteTimeout,
	}

	// Liveness is immediate; readiness flips once workers run.
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	q.Start(ctx)
	srv.SetReady(true)

	// Background journal→Postgres mirror (durable audit trail).
	var mirrorSeq uint64
	if dbStore != nil {
		go mirrorJournal(ctx, journal, dbStore, reg, &mirrorSeq, logger)
	}

	errCh := make(chan error, 1)
	go func() {
		if err := httpServer.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			errCh <- err
		}
	}()
	logger.Info("listening", "addr", cfg.ListenAddr, "workers", cfg.WorkerCount, "queue", cfg.QueueCapacity)

	// Graceful shutdown on SIGINT/SIGTERM.
	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)

	select {
	case err := <-errCh:
		logger.Error("server failed", "err", err)
		shutdown(httpServer, cfg.ShutdownGrace, logger)
		q.Stop()
		if dbStore != nil {
			dbStore.Close()
		}
		os.Exit(1)
	case s := <-sigCh:
		logger.Info("shutdown signal", "signal", s.String())
	}

	shutdown(httpServer, cfg.ShutdownGrace, logger)
	q.Stop() // drain in-flight actions
	if dbStore != nil {
		dbStore.Close()
	}
	logger.Info("stopped cleanly")
}

// shutdown bounds the HTTP drain by the configured grace window.
func shutdown(srv *http.Server, grace time.Duration, logger *slog.Logger) {
	ctx, cancel := context.WithTimeout(context.Background(), grace)
	defer cancel()
	if err := srv.Shutdown(ctx); err != nil {
		logger.Warn("http shutdown", "err", err)
	}
}

// integrationState renders the GHL wiring state for the startup log.
func integrationState(active, dryRun bool) string {
	if !active {
		return "dry-run"
	}
	if dryRun {
		return "token-present-dry-run"
	}
	return "live"
}

func boolState(v bool) string {
	if v {
		return "connected"
	}
	return "off"
}

// mirrorJournal tails the in-memory journal into Postgres every few seconds.
// Events with seq <= lastSeq are skipped; duplicates are tolerated upstream
// (unique index on event_id + ON CONFLICT DO NOTHING).
func mirrorJournal(ctx context.Context, journal *eventlog.Log, dbStore *pg.Store, reg *metrics.Registry, lastSeq *uint64, logger *slog.Logger) {
	ticker := time.NewTicker(5 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			events := journal.List(100, "")
			if len(events) == 0 {
				continue
			}
			// Ascending order for clean sequence tracking.
			for i := len(events) - 1; i >= 0; i-- {
				e := events[i]
				if e.Seq <= atomic.LoadUint64(lastSeq) {
					continue
				}
				copyE := e
				if err := dbStore.InsertEvent(ctx, &copyE); err != nil && !errors.Is(err, pg.ErrDuplicateEvent) {
					logger.Debug("mirror insert failed", "seq", e.Seq, "err", err)
					continue
				}
				reg.Inc(metrics.CounterDBWritesTotal)
				atomic.StoreUint64(lastSeq, e.Seq)
			}
		}
	}
}

// registerWorkers binds action handlers to the queue. Each handler is the
// Go-side half of the split: fast, side-effect-light, idempotent. When a
// GHL executor is attached, actions touch the real CRM (tags, notes, SMS,
// tasks); Postgres records the audit trail; the AI brain drafts replies for
// the message templates.
func registerWorkers(q *queue.Queue, proj *store.MemStore, tracker *scoring.Tracker,
	ruleset *rules.Set, exec *ghlapi.Executor, dbStore *pg.Store, reg *metrics.Registry, brain *ai.Client) {

	// execute wraps the GHL executor (or a local ack when absent) with the
	// projection, scoring tracker, rules evaluation and durable audit write.
	execute := func(a action.Action) error {
		c := &pipeline.Canonical{
			Type:       "action." + a.Kind,
			LocationID: a.LocationID,
			ContactID:  a.ContactID,
			ObservedAt: time.Now(),
		}
		pipeline.Enrich(c)
		proj.Apply(c)
		tracker.Record(c)
		reg.Inc(metrics.CounterScoredTotal)

		// Rules evaluation on the scored context.
		score := tracker.Score(a.LocationID, a.ContactID)
		outcomes := ruleset.Evaluate(rules.Context{Event: c, Score: score.Score})
		if len(outcomes) > 0 {
			reg.Inc(metrics.CounterRulesMatched)
			for _, o := range outcomes {
				if exec != nil && exec.Client() != nil {
					cctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
					if o.Effects.AddTags != nil && a.ContactID != "" {
						_ = exec.Client().AddTags(cctx, a.ContactID, o.Effects.AddTags...)
					}
					cancel()
				}
			}
		}

		// Provider side effects.
		var execErr error
		if exec != nil {
			cctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
			execErr = exec.Execute(cctx, a)
			cancel()
		}

		// Durable audit trail.
		if dbStore != nil {
			actx, acancel := context.WithTimeout(context.Background(), 5*time.Second)
			status := "executed"
			errText := ""
			if execErr != nil {
				status = "failed"
				errText = execErr.Error()
			}
			if err := dbStore.InsertAction(actx, a, status, errText); err != nil {
				reg.Inc(metrics.CounterDBWritesTotal) // counter counts attempts; errors logged below
				slog.Debug("action audit write failed", "kind", a.Kind, "err", err)
			} else {
				reg.Inc(metrics.CounterDBWritesTotal)
			}
			acancel()
		}
		return execErr
	}

	for _, k := range action.AllKinds {
		kind := k
		q.Register(kind, func(_ context.Context, a action.Action) error {
			reg.Inc(metrics.CounterActionsTotal)
			return execute(a)
		})
	}

	// The opt-out is a hard stop with side effects worth recording distinctly.
	q.Register(action.ArchiveContact, func(_ context.Context, a action.Action) error {
		proj.OptOut(a.LocationID, a.ContactID)
		reg.Inc(metrics.CounterActionsTotal)
		slog.Info("opt-out applied (hard stop)", "location", a.LocationID, "contact", a.ContactID)
		return execute(a)
	})
}
