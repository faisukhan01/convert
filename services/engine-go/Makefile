# RidgeLine Go engine — build & operations
# All targets are docker-friendly and CI-friendly; no external Go modules.

GO      ?= go
BINARY  ?= bin/engine
CTL     ?= bin/convertctl
PORT    ?= 8088
SHA     ?= $(shell git rev-parse --short HEAD 2>/dev/null || echo dev)

.PHONY: help build buildctl test vet fmt run docker docker-up metrics demo clean

help: ## Show available targets
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN{FS=":.*?## "}{printf "  \033[36m%-12s\033[0m %s\n", $$1, $$2}'

build: ## Build the engine binary with stamped git SHA
	$(GO) build -ldflags "-X github.com/faisukhan01/convert/services/engine-go/internal/version.GitSHA=$(SHA)" -o $(BINARY) ./cmd/engine

buildctl: ## Build the convertctl CLI
	$(GO) build -o $(CTL) ./cmd/convertctl

vet: ## Static analysis
	$(GO) vet ./...

fmt: ## Format all sources
	$(GO) fmt ./...

run: build ## Run the engine locally with dev conveniences
	ENGINE_DEV=true ENGINE_REQUIRE_SIGNATURE=false ENGINE_PORT=$(PORT) ./$(BINARY)

docker: ## Build the engine image (multi-stage, distroless-style runtime)
	docker build -t ridgeline/engine-go:latest -f Dockerfile ..

docker-up: ## Start engine + app via root docker-compose
	docker compose up -d --build engine

metrics: ## Pretty-print the metrics endpoint
	curl -s http://localhost:$(PORT)/metrics

demo: ## Fire one signed demo intake webhook through the pipeline
	curl -s -X POST http://localhost:$(PORT)/v1/demo/fire \
		-H 'Content-Type: application/json' \
		-d '{"type":"form.submitted","locationId":"demo-location","contactId":"demo-1","name":"Demo Homeowner"}'

clean: ## Remove build artifacts
	rm -rf bin
