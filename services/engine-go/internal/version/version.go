// Package version carries the build identity of the RidgeLine Go engine.
// Values are overridable at link time: -ldflags "-X .../internal/version.GitSHA=$(git rev-parse --short HEAD)".
package version

import "runtime"

const (
	// Name is the canonical service name used in logs, metrics and /healthz.
	Name = "ridgeline-engine-go"
	// App is the product family this engine belongs to.
	App = "RidgeLine Contractor Automation"
	// Version is the semantic version of the engine.
	Version = "1.0.0"
	// GitSHA is stamped by the build system.
	GitSHA = "dev"
	// Human renders a one-line identity string.
)

// Human returns a single-line, log-friendly identity string.
func Human() string {
	return Name + "/" + Version + " (" + GitSHA + "; " + runtime.Version() + "; " + runtime.GOOS + "/" + runtime.GOARCH + ")"
}
