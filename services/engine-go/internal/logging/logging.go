// Package logging configures structured slog output shared by the engine
// and the convertctl CLI. Text format serves humans in development; JSON
// serves log shippers in production.
package logging

import (
	"log/slog"
	"os"
	"strings"
)

// New builds the process-wide slog.Logger according to format and level.
func New(format, level string) *slog.Logger {
	opts := &slog.HandlerOptions{Level: parseLevel(level)}
	var handler slog.Handler
	if strings.EqualFold(format, "json") {
		handler = slog.NewJSONHandler(os.Stdout, opts)
	} else {
		handler = slog.NewTextHandler(os.Stdout, opts)
	}
	return slog.New(handler)
}

func parseLevel(s string) slog.Level {
	switch strings.ToLower(s) {
	case "debug":
		return slog.LevelDebug
	case "warn", "warning":
		return slog.LevelWarn
	case "error":
		return slog.LevelError
	default:
		return slog.LevelInfo
	}
}
