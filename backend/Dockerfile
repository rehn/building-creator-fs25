# Build on the runner's own platform and cross-compile (pure Go, no cgo).
FROM --platform=$BUILDPLATFORM golang:1.25-alpine AS build
ARG TARGETOS TARGETARCH
WORKDIR /src
COPY go.mod go.sum* ./
RUN if [ -f go.sum ]; then go mod download; fi
COPY . .
RUN [ -f go.sum ] || go mod tidy
RUN CGO_ENABLED=0 GOOS=$TARGETOS GOARCH=$TARGETARCH go build -trimpath -ldflags="-s -w" -o /out/server ./cmd/server \
 && mkdir -p /out/data

# Tiny runtime image: just the binary, running as a non-root user.
FROM gcr.io/distroless/static-debian12:nonroot
ARG VERSION=dev
LABEL org.opencontainers.image.title="House to i3d API" org.opencontainers.image.version="${VERSION}"
COPY --from=build /out/server /server
COPY --from=build --chown=65532:65532 /out/data /data
ENV DATABASE_PATH=/data/building-creator-fs25.db LISTEN_ADDR=:8080
VOLUME /data
EXPOSE 8080
USER nonroot
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s CMD ["/server", "-healthcheck"]
ENTRYPOINT ["/server"]
