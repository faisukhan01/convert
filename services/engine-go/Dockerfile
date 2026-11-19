# RidgeLine Go engine — multi-stage build.
# Stage 1: full toolchain, builds both binaries with a stamped SHA.
# Stage 2: minimal runtime with only the engine binary.
FROM golang:1.22-alpine AS build
WORKDIR /src
COPY services/engine-go/go.mod services/engine-go/go.mod
WORKDIR /src/services/engine-go
COPY services/engine-go/ ./
ARG GIT_SHA=dev
RUN CGO_ENABLED=0 GOOS=linux go build \
    -trimpath \
    -ldflags "-s -w -X github.com/faisukhan01/convert/services/engine-go/internal/version.GitSHA=${GIT_SHA}" \
    -o /out/engine ./cmd/engine && \
    CGO_ENABLED=0 GOOS=linux go build \
    -trimpath -ldflags "-s -w" -o /out/convertctl ./cmd/convertctl

FROM alpine:3.20 AS runtime
RUN adduser -D -u 10001 engine && apk add --no-cache ca-certificates curl
COPY --from=build /out/engine /usr/local/bin/engine
COPY --from=build /out/convertctl /usr/local/bin/convertctl
USER engine
EXPOSE 8088
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD wget -qO- http://localhost:8088/healthz || exit 1
ENTRYPOINT ["engine"]
