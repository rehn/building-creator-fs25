# House to i3d – notes for Claude

Web app for building Farming Simulator 25 houses and exporting them as .i3d
(zipped with textures) for Giants Editor. Invite-only accounts, houses saved per user.

## Layout
- backend/  Go 1.25 API, stdlib net/http + SQLite (modernc.org/sqlite, no cgo) by default,
  Postgres (pgx) when DATABASE_URL is set.
  internal/auth (PBKDF2 passwords, tokens), internal/store (SQLite/Postgres),
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
  src/editor/places.mjs = game places: the FS25 boxes and icons (sleep trigger + bed icon, feed pad, bale drop, trailer
  spot + teleport, egg pallets, info area). kind.places lists them; p.places[id] = {wall auto|key, along, out, width,
  depth, height (0 = the kind's), iconAlong, iconOut} (cleanPlaces); kinds place them with placeOnWall/placeOnBuilding;
  gamePlaces(p) gives the preview the same boxes and icons the export writes. Editor: "Game places" section.
  src/editor/age.mjs = p.age (0-60 years): agedColor (via colorFor) and weather() on texture shade/height/marks
  (Mk codes coloured by MASK_RGB: mortar, bare wood, moss, rust, lichen, white rust); tiling, so no
  position-dependent dirt (e.g. a band at the wall bottom) yet.
  src/editor/openings.mjs = the window and door style library (WINDOW_STYLES: casement, sprojs, stall, single,
  hatch; DOOR_STYLES: plain, plank, zbrace, xbrace, panel, sliding), drawn with a kit in wall coordinates
  (box/slab, skip leaves out a face lying on another). p.winStyle / p.doorStyle per building; each entry of
  p.windows has type "window" | "door" (doors only on floor 0, made from a window in the editor) and style
  ("default" = the building's). Every door is the same (no main door): each has porch "none" | "shed" | "gable"
  | "porch" with porchW/porchD (a doorstep where there's no porch); a building always has at least one door (old
  saves and presets get one from doorWall/doorPos/doorW/doorH/entrance, legacyDoor). The sleep point is at the first
  door; animal kinds keep the pasture and outside places off walls with a door (pasture.mjs doorWalls,
  pastureWallFor). Any window or door can move to another wall in the editor. Doors over 1.4 m are a pair.
  Walk-in buildings: geo.doors [{wall, op, slide, leaves: [{hinge, motion {rotation} | {translation}, parts
  {mat: [from, to]}, box}]}]; export: door{n}Leaf{k}Hinge > door{n}Leaf{k} (moved) > meshes + collision,
  one animatedObject + trigger per door; the static parts leave out what leaves carry (exceptRanges).
  Door ironwork is its own material "iron".
  src/editor/surfaces.mjs = tileable inside surfaces (concrete, whitewash, grime, timber, wood, boards, galv,
  steel, plastic, rubber, straw, litter): shade + height maps, no DOM. Fittings are painted paint(colour, surface);
  each vertex carries its surface (G.fittings.s), uvs count texture copies (grain surfaces lay v along the
  longest edge). Export: one diffuse per colour+surface (textures/fit_<surf>_<hex>.png, fittingTextures) and one
  normal map per surface; the preview shows a grey map over vertex colours (drawFittingSurfaces). A walk-in
  building's roof underside (above the wall tops) is raw roof boards in fittings; the plinth is concrete and doors
  painted wood (surfaceSpec).
  Imported items ("My items", /items page): props from Giants Editor, stored per user in the DB
  (assets + asset_files, /api/assets, files as blobs, 50 MB per item). The game loads an item's own
  i3d via a ReferenceNode (its .shapes is encrypted, we can't read it); the preview draws the .obj
  GE exports of it (same coordinates: its bounding box places the reference). src/editor/assets.mjs
  (pure: readI3d, readObj, placement, withAssets ...), item types "asset:<id>"; model.mjs setAssets/
  catalogFor/usedAssets (items of unknown assets are kept as stand-ins, never dropped); exports pack
  the item files in items/<name>_<id>/ (not the .obj). src/editor/itemView.mjs = the page's 3D view.
  The admin can share an item with everyone (assets.shared, added by a migration on open): listed
  and usable by all, changed or deleted only by its owner; API sends shared and mine.
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
- Go tests (54) pass on SQLite (Postgres run only in CI so far), go vet is clean. Frontend tests (340) pass. test/flicker.test.mjs finds coplanar overlapping faces (z-fighting) on the outside, in openings too, for every window and door style.
- Cow barn (kinds/cow.mjs): cowHusbandryPasture (no milk, like cowBarnSmall), automatic water, feed
  and water troughs outside on the pasture wall (kind.outside), a plain walk-through doorway for the
  cows (openings with plain: true; tall openings get a collision gap), feed pad + bale trigger
  outside the fence. Presets: ladugard, fahus, losdriftsstall. Not yet tested in-game.
  Next for cows: a dairy (cowHusbandryBarnMilk with the game's milking robots), straw and manure.
- Shared: kinds/pasture.mjs (yardFrame: fence, feed/other side), layout.mjs furnisher (autoFurnish
  helpers), fieldsFor(kind) (kinds can share a key with different ranges), roof ventilators.
- Hen house: pastureWall (fence + a 40 x 50 cm hen hatch, kind.openings) moves off a wall with a door;
  feed pad and egg pallets go on walls without a door where they can. No gate in the fence (user's choice).
  Canopies on walk-in buildings stay below the eaves (else they showed inside).
  Walk-in insides: exposed roof frame (buildRoofFrame: rafters, ridge beam, tie beams, collar ties),
  a grimy band and a tarred kickboard on the inside walls, and a round galvanised duct under each ventilator (ventDuct);
  the ventilator box's bottom follows the roof so it never shows inside (test/barn-inside.test.mjs).
  Inside pieces draw with a kit (box, cyl, cone, rod, pipe, board, paint; see kinds/props.mjs, which
  also has tone/shade, arc, strawBale, strawLitter). test/pieces.test.mjs keeps every piece inside its
  footprint and height (hanging parts up to c.H) and asks for some detail. Each fittings colour is
  its own i3d part, so tones are kept to a few per material.
- Kinds: settings.kind "house" | "chicken" | "cow", fixed after creation. "New" and "My buildings" group by kind
  (groupByKind, kind.plural); the project list API returns each project's kind (from data.kind, read in SQL).
  Chicken barns export as chickenHusbandryPasture (modelled on data/placeables/rudolfHormann/
  chickenBarnBig, 360 hens). Walk-in kinds (kind.walkIn): inside wall faces, hollow collision, a door
  that opens (every door: see openings.mjs above),
  see-through windows, and an inside
  from kind.furnish(). Confirmed in-game: hens show, door opens, walk-in collision.
  Not yet confirmed: feeding, fence joining the corners, warning stripes, see-through windows, coop interior.
- Agreed plan with the user (old saves may break; aim: a good, user-friendly app):
  1. done: core + kind modules. 2. done: interior as a list of placed pieces (catalog per kind,
  snapping rules, "Fill automatically"; editor has an Inside section with fill/clear). 3. done:
  "Arrange the inside" (editor.mjs, ins state): Plan (orthographic, cut at 1.3 m) / 3D (cut under
  the eaves) via renderer.clippingPlanes, palette, drag with snap, turn, remove, undo/redo
  (layout.mjs History, itemAt, placeNew, rotateItem). Checked end to end with headless Chromium.
  4. started: cows (above). Then sheep, sheds and a vehicle workshop ("fordonsverkstad") as new kinds.
  The user wants Swedish building designs.
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
