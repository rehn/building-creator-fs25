# House to i3d – notes for Claude

Web app for building Farming Simulator 25 houses and exporting them as .i3d
(zipped with textures) for Giants Editor. Invite-only accounts, houses saved per user.

## Layout
- backend/  Go 1.25 API, stdlib net/http + SQLite (modernc.org/sqlite, no cgo) by default,
  Postgres (pgx) when DATABASE_URL is set.
  internal/auth (PBKDF2 passwords, tokens), internal/store (SQLite/Postgres),
  internal/api (handlers), internal/config (env vars), internal/vision (Claude reads photos, anthropic-sdk-go/v2
  v2.1.0, claude-opus-5-5 with structured output and server-side fallbacks; tests use a fake API), cmd/server.
- frontend/ Next.js 16 (App Router, TypeScript). /api/* is proxied to the Go API
  by src/app/api/[...path]/route.ts.
  src/editor/model.mjs = the core every building shares (settings, geometry, export, game-mod XML), no DOM.
  src/editor/kinds/ = one module per kind of building (house.mjs, chicken.mjs), registered in
  kinds/index.mjs, which documents the interface; test/kinds.test.mjs checks every kind has it.
  Kinds import only i3d.mjs, never model.mjs (no import cycles); the core passes them helpers.
  src/editor/i3d.mjs = i3d writer: scene tree (tg/shape), I3dDoc; i3dMappings are looked up by
  node name (mappingsFor), never numbered by hand.
  Inside across parts (PLAN step 4b, done): roomOf(p) returns rects (the main part's floor, then each wing's: abutting
  rectangles) and walls = the inside faces of every stretch of wall round their union (a wall a wing opens into is
  in two pieces; names: the side or "w1Left" ...); x0..z1 stay the main part's. layout.mjs inRoom(room, rect) (the
  rect is in the union), roomBox; snapItem/problems/placeNew/furnisher use them. model.mjs: a wing on a walk-in
  building gets a passage in the house's wall (ops kind "open", up to the ceiling or the wing's height - 25 cm),
  inside faces on its walls, a floor, hollow collision (wall slabs, door gaps) and, in a barn, raw roof boards
  under its roof (rawUnder); the roof frame skips trusses over a valley wing. Barns and hen houses have wings too
  (the pasture and doorway stay on the main part; objectProblems warns when a wing stands in the pasture).
  Wings (PLAN step 4a, done; houses only, barns hide "Wings"): p.wings = [{id 1..4, wall (of the house), pos, width,
  depth, floors (0 = the house's)}], up to MAX_WINGS=4: L, T, U, Z. layout.mjs wingsOf(p) -> per wing {type
  valley|eave|gable|flat, s0, s1, ww, wd, floors, H, frames {w1End, w1Left, w1Right}, rect} or {off: why} (hip ends,
  no room, overlaps an earlier wing); liveWings; wallsOf(p) = every wall (window-list walls are "w{id}End|Left|Right").
  Same pitch/overhang as the house, own floors: a wing whose ridge reaches the house's eaves meets the slope in a
  valley (45 deg triangle cut by notch(); eave/gutter/dormers stop at WG.cut), a lower one ("eave") runs up to the
  wall under the eaves (width clamped to stay under their overhang), on a gable end an annex. model.mjs build():
  WINGS = [{wing, WG, topW}], buildWingBody/Roof per wing, wing walls built with their own height. Old saves (wing,
  wingWall ...; walls wingEnd...) migrate to wing 1 in sanitize. Windows under a wing are hidden (layoutWall cover).
  Per wing also pitch (0 = the house's; the valley is b = k + |a| tanW/tanP) and half (1½-plan, own setting once floors != 0).
  Downpipes: p.pipes = [{id, wall, pos 0..1 along the wall}] on walls with a gutter (layout.mjs eaveWalls: a gable roof's two
  eave walls, all four under hip, each wing's sides); autoPipes(p) from the downpipes count when a save has none; skipped where
  a wing stands against the wall; Downpipes section (count per wall, move one, place again).
  Editor: Wings section (list, add, per-wing sliders, floors, half floor, roof angle, remove). (The inside goes through the wings: see 4b above.)
  Game objects (PLAN step 2, done): src/editor/objects.mjs; p.objects = boxes {id, type, x, z, w, d, h, ix, iz} (sleep,
  food, bales, loading, pallets, info) and the pasture {type: "pasture", wall, a (m from the wall's start), b (m from its
  END: 0 = corner, so it stays at the corners when the building is resized; < 0 runs past), depth}. kind.objects =
  {types, required, pasture: {minWidth, depth}, defaults(p)}; cleanObjects adds missing required ones; defaults come from
  the old placeOnWall logic (henObjects/cowObjects with p.objects undefined), legacy pastureWall/fenceDepth/sleepPoint
  read in sanitize. withPasture (pasture.mjs) derives pastureWall, fenceDepth, pastureMid for the rest of the kind
  (doorway/hatch at pastureMid, troughs on [ea, eb]). House: a sleep object makes it a farmhouse (no sleepPoint
  setting). Editor: Game objects section + plan view (ob state, fitSite, drag boxes and the pasture's 3 handles).
  Inner doors: the wall's `door` setting is 0 none, 1 open doorway, 2 door that opens, 3 door that stays shut; def.leafOf(it) gives model.mjs
  buildInnerDoor the doorway, hinge end (hinge) and side (swing); the leaf is drawn with drawLeaf (openings.mjs) on both faces through
  openingKit(frame of the piece), and recorded in geo.doors with wall null, op.id 1000+id and its own trigger like the outer doors.
  Params can have `when(it)`: shown only when true.
  The inner door's wood is the material "doorIn" (setting innerDoorColor, in Colors), apart from "door" (doorColor).
  Wallpaper on the outer walls' inside: setting insidePaper ("none" | WALLPAPERS index) for every inside wall and p.papers = [{id, wall, s0, s1 (m from the
  wall's left end seen from outside), paper}] sections (layout.mjs cleanPapers, wallBreaks = where inner walls meet a wall); buildWall's inside faces use
  paperAt(s); Inside walls section in Finish (editor.mjs renderPapersUI). A wing's side walls' inside faces run right up to the house (see-through.test.mjs).
  Number entry: the number beside any slider (an output inside .field .fl) can be clicked and typed over, sums allowed (calc.mjs evalNumber; editor.mjs
  installNumberEntry; a slider whose number is not its own value has data-scale, e.g. a window's position in metres).
  Mod of several buildings (start page, app/page.tsx pack()): tick boxes on the cards; each building is opened in a hidden createEditor, ed.exportInto(folder, name)
  (editor.mjs fillMod: house.xml, house.i3d, textures, items, store.png), then modDescXmlMulti lists them all (model.mjs); icon.png from the first.
  Editor panel: one panel with a tab for each task (TABS in model.mjs: building, inside, settings, game; the Shape sections (Size, Roof, Kupor: detail: true) have no tab of their own, they are the main building's card in the details panel; Settings = window and door defaults, Surfaces, Colors, Rooms and curtains, Inside walls; every SCHEMA section has a tab and may have a label: the
  name shown; kinds' own sections are tab "game"), a search box (editor.mjs applySearch: all tabs at once, sections and [data-k] rows with all the words) and settings
  that don't apply hidden (class na, syncOutputs off()).
  Fence drawn by hand: the pasture object has optional points [[x, z] ...] (up to MAX_FENCE_POINTS, objects.mjs); pastureOf() then uses them as the fence, in order (wall, a and b
  still say where the animals go out). Plan view (editor.mjs): a handle per post (green start, red stop), pale dots between posts to make new ones by dragging, snapFencePoint snaps
  to a corner of the building, a wall's line or the grid; buttons Draw the fence myself / + Add a post / Remove this post / Back to a rectangle (fencePoints() starts it from the rectangle).
  Marker pieces (def.ghost, e.g. furniture.mjs sleeppoint): not built into the geometry (buildGeometry(p, {ghosts: true}) for the thumbnails), never overlap or block
  (layout.mjs problems), drawn by the editor as a blue box while arranging; sleepPoint() in model.mjs takes the sleep trigger/icon from the piece before the sleep object.
  Palette: catalog entries have `group` (layout.mjs pieceGroups gives the groups in order); each piece has a thumbnail: model.mjs pieceSheet(p) builds one
  of each piece in a big empty room (geo.itemParts[id] = the vertices of each material a piece drew), pieceMeshes(sheet, id) slices one out, and
  editor.mjs makeThumbs() renders each to a small picture (once per kind, ensureThumbs after entering the arranging). A piece's setting must not be
  called id, type, x, z or rot (test in pieces.test.mjs).
  Every inside piece is free (layout.mjs snapItem): wall pieces (mount "wall") are drawn up against a wall or an inner wall only when put
  within WALL_REACH (0.4 m + half depth; inner faces 0.8 m) of it, a new piece (toWall) always goes to a wall; position sliders (fine = true:
  centimetres, no wall snapping) and a Rotation slider (any angle in degrees; inner walls only quarters). footprint() is the box round a
  turned piece; the build draws a turned box with the oriented box (meshBox in model.mjs), collision is that box.
  Inner walls (kinds/innerwall.mjs, "innerwall" in every walk-in catalog): a floor piece of length 1-20 m, 15 cm deep,
  with a doorway (open in the collision: def.solids, which buildInside uses instead of the footprint box when a piece
  has it) and wallpaper per side from WALLPAPERS (limewash, plain, striped, flowers, painted boards; surfaces
  paperPlain/paperStripe/paperFlower in surfaces.mjs, aged by age.mjs). Piece params can be choices (params[].options:
  an index, a list in the editor; def.snapWalls: layout.mjs endsToWalls draws a wall's ends to the room's walls within 0.25 m, and both
  ends fill the room there (snapItem(..., fine = true) is for the editor's position sliders: centimetres, no end snapping), wall pieces (mount wall) also stand against inner walls (innerFaces, def.runs), and it also meets other inner walls (their faces, T-junctions: snapItem(item, def, room, others, catalog)); length step 0.01). The wall goes up to c.ceil (kit field): the ceiling of a house, the walls' top in a barn.
  Walk-in everywhere (PLAN step 3, done): the farmhouse is walkIn too, with kind.ceiling (a ceiling over the ground
  floor; inside walls stop there; no roof frame; roof underside a soffit), entrance (every door has swing: out | in, out by default)
  ("porch" for a new first door), insideWalls {wall, low, kick} (barns default BARN_WALLS), furnish (board floor),
  catalog + autoFurnish in kinds/furniture.mjs (kitchen, stove, table, chair, bed, single bed, sofa, divan, wardrobe, bookshelf, bookcase, TV bench, desk with or without a computer, cooker with hood, kitchen units with wall cupboards, fridge/freezer, pantry, toilet, shower cabin, washbasin, washing machine, rug;
  tall pieces kept off windows). Pretend rooms only behind upper-floor windows (house forces interior: true; the
  "Rooms behind the windows" checkbox is gone). Every door has opens (default true): a door that doesn't open is
  drawn but gets no leaves/animation, closes the wall's collision and isn't kept clear inside (roomOf).
  Wall zones (PLAN step 1, done): wallSplit one|floor|height, splitHeight, lowerCladding, lowerColor; material
  "wallsLow" (in MATS, its own colour/texture/age) below the split, "walls" above (gables, dormers and porch gables
  are always "walls"); buildWall({split}) adds a drip board (trim) 9 cm in from the ends, broken at openings.
  src/editor/layout.mjs = a walk-in building's inside: roomOf, wall frames, doorSpan, placed pieces
  (p.items: {id, type, x, z, rot, ...params} in building coordinates), snapItem, problems, cleanItems.
  A walk-in kind has a catalog of pieces and autoFurnish(p); buildGeometry draws p.items.
  src/editor/editor.mjs = controls + three.js r128 preview, mounted by Editor.tsx.
  src/editor/interior.mjs = paints the room atlas (layout: ATLAS in model.mjs) and glass texture.
  src/editor/places.mjs = placeOnWall(walls, wall, def)/placeOnBuilding(def): where the kinds put their game objects to start with (the
  objects themselves are in objects.mjs; p.places and cleanPlaces are from before and no longer used).
  gamePlaces(p) (model.mjs) gives the preview the same boxes and icons the export writes.
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
  Photo guide (PLAN step 5, done): fromPhotos.mjs photoRequest(kind) -> {guide, schema}; the answer is {seen, settings,
  openings (each with opens), notes, pasture, wings (parts: wall, along, width, depth, floors, half, pitch), objects
  (game boxes beside a wall: type, wall, along, out)}; guide paragraphs for shape and parts, wall materials (wallSplit),
  doors that open, game objects. applyAnswer turns it into settings (objects placed beside the wall, the kind's other
  objects stay); answerProblems(kind, answer) lists what is wrong (wings left out, objects in the building or pasture,
  hidden windows, too many animals), shown under the summary in the wizard with a button that adds them to the notes.
  Templates from photos (admin only, for everyone's "New"): /admin/templates/new is a wizard (kind + name, photos
  shrunk to 1568 px in the browser + notes, Claude's suggestion); store templates + template_photos, /api/templates
  (published, all users), /api/admin/templates (+ /{id}/suggest, needs ANTHROPIC_API_KEY, else 503 vision_off and the
  wizard offers the kind's presets); or the chat way: chatPrompt(kind, notes) to copy into claude.ai, readAnswer(pasted) -> PATCH
  suggestion; GET /api/admin/vision says whether the API way is on. src/editor/fromPhotos.mjs builds the guide + JSON schema per kind (photoRequest)
  and turns the answer {seen, settings, openings, notes} into settings (applyAnswer -> sanitize). The admin adjusts
  in an ordinary project opened with ?template=ID (photo strip, Claude's notes, Publish template = settings +
  snapshot). Chart: claude.apiKey / claude.existingSecret. Tried with a real key by the user (a template came out OK).
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
- Go tests (66) pass on SQLite (Postgres run only in CI so far), go vet is clean. Frontend tests (682) pass. test/flicker.test.mjs finds coplanar overlapping faces (z-fighting) on the outside, in openings too, for every window and door style.
- Cow barn (kinds/cow.mjs): cowHusbandryPasture (no milk, like cowBarnSmall), automatic water, feed
  and water troughs outside on the pasture wall (kind.outside), a plain walk-through doorway for the
  cows (openings with plain: true; tall openings get a collision gap), feed pad + bale trigger
  outside the fence. Presets: ladugard, fahus, losdriftsstall. Not yet tested in-game.
  Next for cows: a dairy (cowHusbandryBarnMilk with the game's milking robots), straw and manure.
- Sheep barn (kinds/sheep.mjs, kind "sheep", sheepHusbandry like the base game's sheep barns): built on cow.mjs, which takes a
  config (COW / SHEEP: count, minWidth, pallets, animal, fill, fence; cowYard/outsideOf/sceneOf/defaultsOf(cfg)). Wool (WOOL GOATMILK)
  pallets as a game object "pallets" (kind.objects.labels renames it, objectInfo(kind, type)); palletLines/cornerStripes live in
  pasture.mjs. kind.glyph and kind.yard(geo, p) tell the preview which animal icon and fence to draw. Pieces: hay trough, hay rack,
  water bowl, lambing pen, bale. Presets: farhus, farstall, storfarstall. Automatic water; not yet tried in-game.
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
- Kinds: settings.kind "house" | "chicken" | "cow" | "sheep", fixed after creation. "New" and "My buildings" group by kind
  (groupByKind, kind.plural); the project list API returns each project's kind (from data.kind, read in SQL).
  Chicken barns export as chickenHusbandryPasture (modelled on data/placeables/rudolfHormann/
  chickenBarnBig, 360 hens). Walk-in kinds (kind.walkIn): inside wall faces, hollow collision, a door
  that opens (every door: see openings.mjs above),
  see-through windows, and an inside
  from kind.furnish(). Confirmed in-game: hens show, door opens, walk-in collision.
  Not yet confirmed: feeding, fence joining the corners, warning stripes, see-through windows, coop interior.
- docs/PLAN.md (Swedish) is the current plan, agreed Nov 2026: one model for every building (parts = rectangles
  attached to each other, two wall zones, ground floor walk-in everywhere, doors openable or not, game objects as
  placeable objects). Steps: 1 wall zones, 2 game objects, 3 walk-in for all + openable doors, 4 parts, 5 Claude guide.
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
- Troughs and the opening (cow/sheep): feedTrough and waterTrough are game objects (box: x, z, w, d, h = top edge; optional, objects.mjs
  objectWarnings says when one is missing, objectProblems when it's not inside the fence); cow.mjs troughFrom builds the trough and the places
  animals stand (both long sides if inside the fence). Start positions: startTroughs (along the pasture wall). The doorway to the pasture is set on the
  pasture object: gapAt (middle, m from the wall's left end), gapW, gapH (kind.objects.pasture.gapSize); pastureOf gives mid/gapW/gapH, withPasture
  pastureMid/pastureGapW/pastureGapH. Without a trough the husbandry XML leaves out its plane/places (not tried in the game).
- Per-wall split: p.wallZones = {wall: {split: one|floor|height, height}} (any key of wallsOf, wings too) overrides wallSplit/splitHeight for that wall;
  model.mjs splitAtOf(p, key); the two materials stay the building's. Editor: renderZonesUI under Surfaces. Vertical boards: wallCladding "vertical".
  Door style "hole" = empty framed doorway (a plain hatch op); doors and the pasture opening can have a ramp (buildRamp).
- First-person walk in the preview ("Walk around" button, editor.mjs "Walking around"): walk.mjs makeWalker(geo.collision) (pure: ground from faces that lead up,
  walls from steep faces, cylinder 28 cm, step 45 cm); W A S D/arrows, Shift runs, drag looks, Esc leaves. Closed doors and furniture block. Ceiling over the
  ground floor: setting `ceiling` (house default true, barns false; ceilingC in model.mjs). A wing has its own floor height (wing.floorHeight, wing.fh).
- Inside like the outside: setting `insideSame` (barns default true, houses false; Inside tab > Inside walls). model.mjs buildWall: each zone as outside (split
  follows the wall's own split): timber cladding = backs of boards at 3 cm + studs (buildStuds: 45 mm, every 60 cm, plates, headers, sills, to the wall's inside
  face), plaster = whitewash surface in the wall colour at the inside face (same thickness, WALL_T, as a stud wall); wallpaper goes over. A barn ceiling is boards on beams.
- Inner walls: a side can be PANEL (kinds/innerwall.mjs panelSide): the building's own material "wallsIn" (settings innerCladding/innerColor, same CLADDING choices as
  the facade; kit.panel draws in it) with studs in front (2.5 cm deep, kit.studs = the building's studSpacing/studWidth/studIrregular).
- Parts as a tree (docs/PLAN_PARTS.md, step 1 done): p.wings[i].wall may be a wall of an earlier wing ("w1Left"); wingIdOf(wall) = the parent (0: the house); MAX_WINGS = 12.
  layout.mjs wingsOf is recursive (parent, inherited floors/fh/pitch/half, roof type from the parent's roof, off when it would touch more than its parent); model.mjs
  builds a nested part with walls, floor, inside (own ceiling at its fh, passages up to the lower ceiling of parent and part, windows hidden under a child) and a roof that meets its parent's (model.mjs WINGS: houseRoof or the parent's WG as `pr`; the parent's slope, eave fascia and gutter are cut for a child's valley); the editor: Shape > Parts (tree, names; renderWingsUI) and Openings > "Things on a wall" (wallViewHtml/bindWallView; model.mjs wallItems, addOpening, addPartOn, wallLabel, partName); clicking a wall in 3D selects it there (pick).
  The most parts is a setting: the web container's MAX_PARTS variable (12 if not set, at most HARD_MAX_PARTS = 40; Helm web.maxParts, docker-compose MAX_PARTS), served by
  the web app's /config route and applied at start by AppConfig.tsx (layout.mjs setMaxParts; MAX_WINGS is a live binding).
- Saves must keep building: test/golden-saves.test.mjs builds representative saves (every preset, wing types, old formats) and compares a summary (parts, openings, triangles per material, size)
  with test/golden-saves.json, made with the code from before the parts tree. A change that should alter old saves updates it on purpose (UPDATE_GOLDEN=1 npm test). Saves are migrated when
  loaded (sanitize), nothing in the database changes.
- Materials per part (step 3b): a part may set wallCladding, wallColor, wallSplit, splitHeight, lowerCladding, lowerColor, roofMaterial, roofColor, trimColor (empty = as the parent);
  model.mjs partStyle (inherits up to the building), matTable (variants "wallsP1" "roofP1" ... shared by equal values, none for the building's own), matList; poly/addMesh map walls,
  wallsLow, roof, trim through partMats while a part is built (usePart); the editor makes meshes/textures for variants on demand (makeMesh, texturedNow). Not cached: the editor changes p in place.
- Parts to share (step 5): partfile.mjs exportPart(p, id) -> {format "house-to-i3d-part", version, name, parts (renumbered, local walls), windows, items (a, b, rot in the part's frame)}; importPart(p, wall, file) ->
  {settings: {wings, windows, items}, notes} or {error}; the editor: Parts > "Export this part" / "Import a part...". Parts may stand over windows (not doors): model.mjs freeStretches(forPart).
- My parts (the library of saved part files): backend store/parts.go + api/parts.go (table `parts`, /api/parts, only the admin shares, 256 KB per file); the editor gets `parts` (list/get/save/update/remove/isAdmin)
  from Editor.tsx (api.ts parts functions); Parts section: "Save to My parts", the My parts list (editor.mjs myPartsHtml/bindMyParts/applyPart).
- Photo guide and parts (step 6 done): photoRequest's wings items have wall (the building's or an earlier part's: w1Left ...), name and optional own look (wallCladding, wallColor, roofMaterial,
  roofColor, trimColor; "" = as its parent); applyAnswer passes them on; the guide says a part meets only its parent's roof. docs/PLAN_PARTS.md is done (steps 1-6).
- Building tab (the tree, replaces the Parts section and the window editor): model.mjs buildingTree(p) (main > floors > walls > windows, doors, and on the ground floor the parts, which have floors > walls ...; lost = parts whose parent is left out). Heights per floor: floorHeight (ground floor), floor2Height, floor3Height (0 = as the ground floor), a part's own with the same names (0 = as what it stands on); layout.mjs floorsOf/totalHeight/floorBase/floorAt, wingsOf gives hs per part. The rows are the schema's (floorRow: true, not in Shape) and move into the card of a floor (editor.mjs floorCardHtml/bindFloorCard); the wall between a part and its parent: by default a wide opening (the rooms are one), or closed (closed: a whole wall; windows and doors on the parent's wall under it are ordinary openings, not hidden: model.mjs wingCover/wingCap, freeStretches, addOpening(.., at); old passage >= 1 = closed; buildLeaf is shared with the inner doors);
  editor.mjs "The building as a tree": renderTreeNav/renderTreeUI, selectNode(kind, v) (main | wall | win | part; tapping the preview calls it), cards below the tree: mainCardHtml (add, import, My parts),
  wallCardHtml (+ Window, + Door, + Part), renderWinCard (window/door), renderPartCard (part + materials). renderWinUI/renderWingsUI are aliases of renderTreeUI. Openings tab keeps the style and size of new windows.
- Tree cards (what a chosen node shows, editor.mjs renderTreeUI): main building = its size/roof sections (the Shape tab's sections are moved under the card while it is chosen, placeShape; Shape tab otherwise);
  a wall = add window/door/part, "Look of this wall" (p.wallStyles = {wall: {wallCladding, wallColor, lowerCladding, lowerColor}}, matTable().ow: material variants per wall, useWall in buildGeometry; the split per wall is p.wallZones),
  wallpaper sections (p.papers) and the downpipes on it (eave walls only, pipesCardHtml). renderZonesUI/renderPapersUI take (host, fixedWall); the Look and Inside tabs no longer have per-wall editors. addPartOn (model.mjs) gives a new part the look of its wall (wallStyles, wallZones).
- Door style "lowgate" (openings.mjs): galvanised steel gate (material "gutter") only 1.2 m high in a tall opening (buildDoor caps the leaf).
- Valley roofs: the wing's slope ends on the exact 45-degree valley line (k + eR * slopeR); test/valley-gap.test.mjs looks for holes seen from above.
- Animals' walking area (cow/sheep barns, kinds/cow.mjs + walkarea.mjs + pasture.mjs; confirmed in-game): the game makes the outdoor area from the fence's contour (posts + `fence/additionalNavMeshNodes`)
  merged with `navigation#shape` (the inside). Export: `<navigation shape="navigationMeshShape"/>` (the attribute `shape` must be in i3d.mjs NODE_ATTRS or the i3dMapping is missing: "Index not found"),
  under navigationRootNode a CPU mesh (meshUsage 256 is required) navigationMeshShape + walkingPlane (static, group 0x400000, mask 0x1) of the building's floor and the ramps through the pasture doorway (animalNav/navMesh,
  inside only, at the top of the floor), and navmeshBlocker boxes (group 0x800000) for wall slabs with a gap at each entrance, pieces and troughs. Setting animalsInside (default on); off = old rootNode mode with footprint blockers.
  Entrances (objects.mjs animalEntrances): the pasture's doorway and a hole-style door on the pasture wall. KEEP in walkarea.mjs = distances the animals keep from walls/pieces. Only floor reachable from a doorway counts.
  The fence goes counter-clockwise (ccwFence). The game closes the contour with a straight line from the last post to the first, which cut through the building when the pasture goes round a corner:
  navContourNodes (pasture.mjs) adds points along the building (additionalNavMeshNodes), as far out as the end posts stand (closureOffset) and stopping short of the fence's first/last stretch.
  Meadow: a clearTask polygon round the building (footprintHull); levelArea groundType="dirt" for animal buildings; a floor 3 cm above the ground when the foundation is 0 (FLOOR_LIFT).
- FS25's own Lua source, engine function docs and collision bit names are in the SDK (`sdk/debugger/gameSource.zip`, `sdk/debugger/scriptBinding.xml`, `shared/collisionMaskFlags.xml`); the game's `log.txt`
  (Documents/My Games/FarmingSimulator2025) names mapping/mesh/uv errors, and the console command `showNavMesh true` draws the navigation mesh in the game. UVs must stay within [-32, 32] (emitFace in model.mjs).
- Upper-floor windows of a walk-in building without rooms (barns; p.interior false) get boards a little behind the glass (setting loftBacking, default true; Inside > Inside walls). Rooms behind windows are houses only. Later: furnishing the upper floors.

- Split (PLAN, step 1 done): p.splits = [{id 1..4, at (m along the ridge from the left end, or the back)}] (cleanSplits, addSplit in model.mjs; layout.mjs splitsOf/SPLIT_WALLS/MAX_SPLITS): each is a wall across the building up to the roof (shaped like a gable wall, key "s1".., in wallsOf, so windows and doors go in it as in any wall; WALL_NAMES "Divider n"; no doorstep or ramp), built after the house walls in model.mjs; the tree has them as walls under each floor; the main card has "Dividers" (editor.mjs dividersHtml). None under a hip roof. A part has dividers too: wings[i].splits (keys "w1D1" ..., wingIdOf knows them; frames in wingsOf, built after the part's walls; model.mjs addPartSplit, isSplitWall; the part card has the same Dividers section, dividersHtml(pid)). Sections (step 2 done): a divider's floors (0 = as the building) and floorHeight (the ground floor's, 0 = the floors share the height) are for the section after it, the total height stays (layout.mjs sectionHs, sectionsOf(P, wid), sectionRuns(P, key, L) = the stretches of a wall by section, sectionAtPoint); model.mjs secAt/secHs/fhOf(key, s) give a window's floors and heights where it stands (layoutWall: a floor the section lacks hides the window), buildWall's inside faces are built per section run (ceiling = its ground floor), the ceiling slabs are cut at the dividers, inner pieces take their section's ceiling. The editor's Dividers section has Floors after it / Ground floor height after it. The tree by section (step 3 done): with dividers buildingTree gives building > sections (type "section", index, from, to, floors) > floors (section, missing: true for a floor the section lacks that has something hidden on it) > walls (section, span = the stretch of a long wall in that section; an end wall in one section, a divider in the one with more floors) > items by where they stand; a part's tree is built the same way. Without dividers there is no section level. Selection state wvSec; nodeKey/nodeArg carry the section; a floor of a later section points to its divider (its height settings), sectionCardHtml, 'Go to that divider'; +Window/+Door on a wall card go in the chosen section (addOpening(.., at)). Next steps (inside, animals): docs/PLAN.md.

- Tree actions: right-click a window, door, part or divider in the tree for a menu (Duplicate, Delete); Ctrl+D and Delete do the same for what is chosen (editor.mjs nodeTarget/duplicateTarget/deleteTarget, treeKey; not in text fields, not while arranging the inside or walking). Model side: model.mjs duplicateOpening (the nearest free stretch on the wall) and duplicateSplit (a new divider with the same floors and copies of what is in it); a part is copied with exportPart/importPart onto its own wall. The remove buttons use the same removeWindow/removePart/removeDivider.

- Moving things in the tree: windows, doors and parts can be dragged (HTML5 drag and drop on the tree rows; the rows carry data-wall/data-floor) before or after another item (same wall and floor: model.mjs moveBeside lays the list out again in the new order over the same stretch; else moveToWall puts it beside it on that wall) or onto a wall row (moveToWall: nearest free stretch to the middle; doors only to the ground floor, parts never on themselves or their children); the menu has Move up/down and Alt+Up/Down do the same one step (editor.mjs applyMove/moveStep/dropOn). Dividers and floors are not moved; the tree order stays the physical order.

- Panels: the editor is three columns on a wide screen: the left panel (tabs, search, the tree; --panelw, 360 px to start), the details panel (class hx-details, id details: what is chosen in the tree, i.e. mainCard, mainShapeHost, wallCard, winEditor, wingsEditor; only on the Building tab and not while searching; --detwset, 380 px) and the preview. Two drag handles (#rz1, #rz2; arrow keys, double click resets) change the widths, kept in localStorage "hx-panel-w" (editor.mjs panelSizes/applyPanelSizes/installPanelResizers; the preview keeps at least 320 px). On a narrow screen the details come under the panel. The Shape sections are moved into the details panel while the main building is chosen (placeShape) and back home when searching.

- Sections are the thing the user works with (a divider is the wall a section starts with): the card of a section (not the first) has where it starts, its floors and Remove; a floor of a section has its height (floor card, slider "Height of this floor": layout.mjs cascadeHeight, model.mjs setSectionFloorHeight: the floor above takes or gives the difference, then the next one up; the top floor is never adjustable, it is what is left of the total); split.heights = the heights of the floors but the top (0 = a share of what is left; old saves' floorHeight = the first), layout.mjs sectionHs(base, floors, heights). The first section has the building's own floorHeight/floor2Height/floor3Height; "Height of all the floors together" (model.mjs setTotalHeight) on the building's and a part's card changes the top floor of the first section (the other sections follow the total). A building without dividers keeps the independent floor rows on its floor cards. The wall between sections is named "Wall before section N"; its card only points to the section.

- Half floors per section (1½ and so on): split.half (null = as the building, true/false); section.half in sectionsOf = that, or the building's (the part's) half. The walls are as high in every section, so the knee wall is carved out of the section's height: totalH = the building's floors + knee wall (if it has the half floor); a section with an attic has totalH - kneeWall for its floors, one without it has all of totalH (layout.mjs sectionHs(base, floors, heights, total)). A section can have an attic whether or not the building has one (it needs room: floors of 2.3 m each + the knee wall). The tree, the windows (layoutWall, gapsWithFloor), wallFloorAt, floorNameIn(pid, f, si) and the floor card use the section's half. The Floors select of a section lists 1, 1½, 2, 2½, 3, 3½. Attic windows: only in gable walls (layout.mjs isGableWall: a gable end, a part's end, a divider), on the floor with index = the section's floors (wallHasFloor, maxFloorsWithAttic; addOpening/moveToWall/openingProblem use them).

- Game objects are in the tree: buildingTree(p).game = {type: "game", children: [{type: "object", id, otype, name}]} (a node of its own after the main building, null when the kind has no objects); choosing "Game objects" shows the group card (the plan view button, the objects that can be added, Place all automatically) and an object its sliders, in the details panel (editor.mjs renderObjectsCard(host); renderObjectsUI() just redraws the tree/details; addObject/removeObject). The context menu on the group adds the missing ones, on an object it deletes (not a required one). Clicking an object in the plan view chooses it in the tree. The Game tab keeps the settings: the animals (counts, ...) and Shop and mod (price ...); it has no objects section.

- Animals and the walls between sections: kinds/cow.mjs dividerBlocks(p, geo) turns every divider wall (the building's "s1" and a part's "w1D1") into floor blocks like an inner wall, less its framed empty doorways (a door style "hole"); a door in it, open or shut, counts as closed. They go in animalsInside's items, so the floor behind a closed wall is not walkable (only what can be reached from an entrance counts) and the game gets blocker boxes for them (test/animals-sections.test.mjs).

- Roof frames of parts and new parts: a walk-in building without a ceiling has a roof frame inside; each part has its own (model.mjs, after the wing roofs: buildRoofFrame from where its roof is whole, WG.xE for a valley, to its end wall, with a gap where a part on it opens into it), and in the main frame the side where a part opens into the roof loses its rafters (skip(a) = {side}) while the far side keeps them (only parts directly on the house count). A new part (addPartOn) is closed, and the editor gives it a door in the wall between (addPartDoor): old saves keep their wide opening (the part's "Wide opening into it" checkbox).

- Sections inside (PLAN step 4 done): layout.mjs roomOf cuts each floor at its dividers: room.rects has a rectangle for each section ({..., wid (0 = the building, else the part), sec}) with the wall's thickness left out, so a piece can't stand across a wall, and the wall's two faces are wall stretches named after it ("s1", "w1D1"; wall pieces stand against them, windows in it are avoided); room.floorRects is the whole floor (the floor, the ceiling and the animals' floor use it: no seam under a doorway). A door in a divider is kept clear on both sides (keepOut). furnisher.freeLine stays inside the room's rectangles. Photo guide: fromPhotos.mjs asks for "sections" ([{at, floors, attic: as_building|yes|no}], also per wing) and applyAnswer makes them splits (test/from-photos.test.mjs); golden saves have five with sections.

- Windows per wall per floor with sections: genRow leaves out the stretches of a wall whose section lacks the floor (they count like doors: the windows go over the stretches with the floor, evenly by length). A divider is dragged in the plan view of arranging the inside: layout.mjs dividerAt(P, x, z) finds it, splitAtFrom(P, pid, id, point) gives its new "at" (5 cm, 2 m from the ends and the other dividers); editor.mjs ins.divider (pointerdown/move/up in setupOrbit).

- Studs inside (buildStuds, "Inside like the outside" = insideSame): drawn where the inside is timber: a zone whose panel is boards (lockpanel, horizontal, vertical) and has no wallpaper; spacing/width/unevenness are studSpacing/studWidth/studIrregular (Settings > Inside walls). The panel of a zone is the wall's own (p.wallStyles[key], set under "Look of this wall"), else its part's, else the building's: a plastered wall has none (test/studs-per-wall.test.mjs).

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

## Languages (i18n)
- English is the default; the language is the `lang` cookie (switcher in TopBar, LanguageSelect.tsx; AppConfig.tsx sets it and starts the translator). Texts: `frontend/src/i18n/locales/<lang>.json`, the English text is the key
  (`sv.json` = Swedish; `en.json` is generated by `npm run i18n`, which scans the source for texts + `scripts/i18n-extra.json`; `npm run i18n -- --missing` lists what a language lacks).
  A key with `{value}` matches any text of that shape (values translated recursively). index.mjs: `t(text, values)`, `translateText`; dom.mjs translates text nodes and placeholder/title/aria-label at runtime (MutationObserver);
  user-written names need `translate="no"`; confirm()/prompt()/texts put together in code use `t()`. Claude's photo guide stays English. A new language: add the json, an entry in LANGS and TEXTS (index.mjs).

- Sheds (kinds/shed.mjs, kind "shed", category "sheds"): garage, maskinhall, vedbod presets; concrete floor, empty inside to start with (autoFurnish gives no items); pieces workbench, toolwall, shelves, lift, pit, barrels, tyres. A vehicle workshop is a game object (objects.mjs "workshop", optional, glyph "wrench"): with one, placeable type garageWorkshopSolarPanels, nodes workShop > vehicleTrigger (mask 0x10000) / playerTrigger (0x100000) / markerWrench, `<workshop><sellingPoint .../>`, SHOP hotspot (test/shed.test.mjs). Not tried in-game. Open sides (carport, lider): settings openFront/openBack/openLeft/openRight (kind section "Open sides", layout.mjs openSide); model.mjs build() leaves the wall out and builds posts (every 3 m, 14 cm) and a beam (trim) along its top, following a leaning roof; windows/doors on an open side are dropped in sanitize and an open building gets no automatic door; test/open-sides.test.mjs. Presets carport, lider. Not tried in-game; the inside (roomOf) still counts an open side as a wall.
