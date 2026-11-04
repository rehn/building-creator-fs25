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
  src/editor/model.mjs = the core every building shares (settings, geometry, export, game-mod XML), no DOM.
  src/editor/kinds/ = one module per kind of building (house.mjs, chicken.mjs), registered in
  kinds/index.mjs, which documents the interface; test/kinds.test.mjs checks every kind has it.
  Kinds import only i3d.mjs, never model.mjs (no import cycles); the core passes them helpers.
  src/editor/i3d.mjs = i3d writer: scene tree (tg/shape), I3dDoc; i3dMappings are looked up by
  node name (mappingsFor), never numbered by hand.
  src/editor/layout.mjs = a walk-in building's inside: roomOf, wall frames, doorSpan, placed pieces
  (p.items: {id, type, x, z, rot, ...params} in building coordinates), snapItem, problems, cleanItems.
  A walk-in kind has a catalog of pieces and autoFurnish(p); buildGeometry draws p.items.
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
- Go tests (45) pass on SQLite (Postgres run only in CI so far), go vet is clean. Frontend tests (175) pass.
- Hen house: pastureWall (fence + a 40 x 50 cm hen hatch, kind.openings) is never the doorWall;
  feed pad and egg pallets go on the walls without the door. No gate in the fence (user's choice).
  Canopies on walk-in buildings stay below the eaves (else they showed inside).
- Kinds: settings.kind "house" | "chicken", picked in "New" (category, then preset) and fixed after.
  Chicken barns export as chickenHusbandryPasture (modelled on data/placeables/rudolfHormann/
  chickenBarnBig, 360 hens). Walk-in kinds (kind.walkIn): inside wall faces, hollow collision, a door
  leaf exported as node door1 at its hinge with an animatedObject, see-through windows, and an inside
  from kind.furnish(). Confirmed in-game: hens show, door opens, walk-in collision.
  Not yet confirmed: feeding, fence joining the corners, warning stripes, see-through windows, coop interior.
- Agreed plan with the user (old saves may break; aim: a good, user-friendly app):
  1. done: core + kind modules. 2. done: interior as a list of placed pieces (catalog per kind,
  snapping rules, "Fill automatically"; editor has an Inside section with fill/clear). 3. done:
  "Arrange the inside" (editor.mjs, ins state): Plan (orthographic, cut at 1.3 m) / 3D (cut under
  the eaves) via renderer.clippingPlanes, palette, drag with snap, turn, remove, undo/redo
  (layout.mjs History, itemAt, placeNew, rotateItem). Checked end to end with headless Chromium. 3. (was) Interior mode in the editor with two
  views (flat plan with grid, and 3D with roof faded), drag, rotate, snap, undo. 4. More pieces,
  then sheep, cows, sheds and a vehicle workshop ("fordonsverkstad") as new kinds.
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
