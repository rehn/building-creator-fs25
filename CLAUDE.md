# House to i3d – notes for Claude

Web app for building Farming Simulator 25 houses and exporting them as .i3d
(zipped with textures) for Giants Editor. Invite-only accounts, houses saved per user.

## Layout
- backend/  Go 1.25 API, stdlib net/http + SQLite (modernc.org/sqlite, no cgo) by default,
  Postgres (pgx) when DATABASE_URL is set.
  internal/auth (PBKDF2 passwords, tokens), internal/store (SQLite),
  internal/api (handlers), internal/config (env vars), cmd/server.
- frontend/ Next.js 16 (App Router, TypeScript). /api/* is proxied to the Go API
  by src/app/api/[...path]/route.ts.
  src/editor/model.mjs = pure house logic (settings, geometry, i3d export, game-mod XML), no DOM.
  src/editor/editor.mjs = controls + three.js r128 preview, mounted by Editor.tsx.
  src/editor/interior.mjs = paints the room atlas (layout: ATLAS in model.mjs) and glass texture.
- charts/house-to-i3d = Helm chart (SQLite on a PVC, or Postgres in-release/external);
  charts/test.sh renders and checks every setup.
- docker-compose.yml runs api + web; CI in .github/workflows/ci.yml pushes
  house-to-i3d-api and house-to-i3d-web to Docker Hub on releases (vX.Y.Z), then
  the chart to oci://registry-1.docker.io/rehn/house-to-i3d.

## How we work
- TDD: write the failing test first, then the code.
- Backend tests: cd backend && go test ./...  (TEST_DATABASE_URL=postgres://... also runs
  the store tests on Postgres; CI does both)
- Chart tests: bash charts/test.sh (helm v4 in WSL at /usr/local/bin)
- Frontend tests: cd frontend && npm test (node --test, no browser needed)

## Status
- Go tests (45) pass on SQLite (Postgres run only in CI so far), go vet is clean. Frontend tests (96) pass.
- npm run build succeeds.
- go.sum and package-lock.json are committed.

## Dev environment (WSL)
- ./dev.sh starts API (:8080) + Next dev server (:3000); data in .dev/ (gitignored),
  ./dev.sh --reset wipes it. Reachable from the Windows browser at localhost:3000.
- Node 22 and gh live in ~/.local/bin (installed without sudo).
- Docker is not integrated into WSL; Docker Desktop runs on the Windows side.

## FS25 reference (read-only, on the Windows side)
- Game install: /c/Program Files (x86)/Farming Simulator 2025 (Git Bash path).
  shared/xml/schema/placeable.xsd is the authoritative placeable XML schema;
  data/placeables/brandless/gardenSheds/level01 is the template the export's
  area nodes (clear/level/test/tipOcclusion) and collision filter follow.
