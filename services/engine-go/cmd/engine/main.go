// Command engine is the RidgeLine Go automation engine daemon: a
// high-performance webhook ingest + normalization + action queue service
// that complements the Next.js application (the "Go/worker split").
//
//	$ ENGINE_PORT=8088 ./engine
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
	"syscall"
	"time"

	"github.com/faisukhan01/convert/services/engine-go/internal/action"
	"github.com/faisukhan01/convert/services/engine-go/internal/config"
	"github.com/faisukhan01/convert/services/engine-go/internal/eventlog"
	"github.com/faisukhan01/convert/services/engine-go/internal/logging"
	"github.com/faisukhan01/convert/services/engine-go/internal/metrics"
	"github.com/faisukhan01/convert/services/engine-go/internal/pipeline"
	"github.com/faisukhan01/convert/services/engine-go/internal/queue"
	"github.com/faisukhan01/convert/services/engine-go/internal/ratelimit"
	"github.com/faisukhan01/convert/services/engine-go/internal/server"
	"github.com/faisukhan01/convert/services/engine-go/internal/store"
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
	logger.Info("starting", "identity", version.Human(), "addr", cfg.ListenAddr, "secret", cfg.GuardedSecret())

	// Dependency graph: metrics → journal → queue → orchestrator → projection.
	reg := metrics.NewRegistry()
	journal := eventlog.New(cfg.EventLogCapacity)

	q := queue.New(cfg.QueueCapacity, cfg.WorkerCount, cfg.MaxAttempts, cfg.BaseBackoff, cfg.MaxBackoff)
	proj := store.New()
	registerWorkers(q, proj, reg, cfg)

	orch := pipeline.NewOrchestrator(journal, q, reg)
	orch.Secret = cfg.WebhookSecret
	orch.RequireSig = cfg.RequireSignature

	limiter := ratelimit.New(cfg.RateLimitEventsPerMin, cfg.BurstMultiplier)

	srv := server.New(cfg, orch, q, limiter, proj, reg)

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
		os.Exit(1)
	case s := <-sigCh:
		logger.Info("shutdown signal", "signal", s.String())
	}

	shutdown(httpServer, cfg.ShutdownGrace, logger)
	q.Stop() // drain in-flight actions
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

// registerWorkers binds action handlers to the queue. Each handler is the
// Go-side half of the split: fast, side-effect-light, idempotent. Real
// message delivery remains behind the provider adapters on the app side;
// the worker layer is where fan-out, dedupe and backoff happen at scale.
func registerWorkers(q *queue.Queue, proj *store.MemStore, reg *metrics.Registry, cfg *config.Config) {
	_ = cfg // reserved for adapter wiring when provider credentials land

	ack := func(_ context.Context, a action.Action) error {
		proj.Apply(&pipeline.Canonical{
			Type:       "action." + a.Kind,
			LocationID: a.LocationID,
			ContactID:  a.ContactID,
			ObservedAt: time.Now(),
		})
		reg.Inc(metrics.CounterActionsTotal)
		return nil
	}

	for _, k := range action.AllKinds {
		if k == action.ArchiveContact {
			continue
		}
		q.Register(k, ack)
	}

	// The opt-out is a hard stop with side effects worth recording distinctly.
	q.Register(action.ArchiveContact, func(_ context.Context, a action.Action) error {
		proj.OptOut(a.LocationID, a.ContactID)
		reg.Inc(metrics.CounterActionsTotal)
		slog.Info("opt-out applied (hard stop)", "location", a.LocationID, "contact", a.ContactID)
		return nil
	})
}
