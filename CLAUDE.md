# House to i3d – notes for Claude
  The inner door's wood is the material "doorIn" (setting innerDoorColor, in Colors), apart from "door" (doorColor).

  The inner door's wood is the material "doorIn" (setting innerDoorColor, in Colors), apart from "door" (doorColor).
Web app for building Farming Simulator 25 houses and exporting them as .i3d
  The inner door's wood is the material "doorIn" (setting innerDoorColor, in Colors), apart from "door" (doorColor).
(zipped with textures) for Giants Editor. Invite-only accounts, houses saved per user.
  The inner door's wood is the material "doorIn" (setting innerDoorColor, in Colors), apart from "door" (doorColor).

  The inner door's wood is the material "doorIn" (setting innerDoorColor, in Colors), apart from "door" (doorColor).
## Layout
  The inner door's wood is the material "doorIn" (setting innerDoorColor, in Colors), apart from "door" (doorColor).
- backend/  Go 1.25 API, stdlib net/http + SQLite (modernc.org/sqlite, no cgo) by default,
  The inner door's wood is the material "doorIn" (setting innerDoorColor, in Colors), apart from "door" (doorColor).
  Postgres (pgx) when DATABASE_URL is set.
  The inner door's wood is the material "doorIn" (setting innerDoorColor, in Colors), apart from "door" (doorColor).
  internal/auth (PBKDF2 passwords, tokens), internal/store (SQLite/Postgres),
  The inner door's wood is the material "doorIn" (setting innerDoorColor, in Colors), apart from "door" (doorColor).
  internal/api (handlers), internal/config (env vars), internal/vision (Claude reads photos, anthropic-sdk-go/v2
  The inner door's wood is the material "doorIn" (setting innerDoorColor, in Colors), apart from "door" (doorColor).
  v2.1.0, claude-opus-5-5 with structured output and server-side fallbacks; tests use a fake API), cmd/server.
  The inner door's wood is the material "doorIn" (setting innerDoorColor, in Colors), apart from "door" (doorColor).
- frontend/ Next.js 16 (App Router, TypeScript). /api/* is proxied to the Go API
  The inner door's wood is the material "doorIn" (setting innerDoorColor, in Colors), apart from "door" (doorColor).
  by src/app/api/[...path]/route.ts.
  The inner door's wood is the material "doorIn" (setting innerDoorColor, in Colors), apart from "door" (doorColor).
  src/editor/model.mjs = the core every building shares (settings, geometry, export, game-mod XML), no DOM.
  The inner door's wood is the material "doorIn" (setting innerDoorColor, in Colors), apart from "door" (doorColor).
  src/editor/kinds/ = one module per kind of building (house.mjs, chicken.mjs), registered in
  The inner door's wood is the material "doorIn" (setting innerDoorColor, in Colors), apart from "door" (doorColor).
  kinds/index.mjs, which documents the interface; test/kinds.test.mjs checks every kind has it.
  The inner door's wood is the material "doorIn" (setting innerDoorColor, in Colors), apart from "door" (doorColor).
  Kinds import only i3d.mjs, never model.mjs (no import cycles); the core passes them helpers.
  The inner door's wood is the material "doorIn" (setting innerDoorColor, in Colors), apart from "door" (doorColor).
  src/editor/i3d.mjs = i3d writer: scene tree (tg/shape), I3dDoc; i3dMappings are looked up by
  The inner door's wood is the material "doorIn" (setting innerDoorColor, in Colors), apart from "door" (doorColor).
  node name (mappingsFor), never numbered by hand.
  The inner door's wood is the material "doorIn" (setting innerDoorColor, in Colors), apart from "door" (doorColor).
  Inside across parts (PLAN step 4b, done): roomOf(p) returns rects (the main part's floor, then each wing's: abutting
  The inner door's wood is the material "doorIn" (setting innerDoorColor, in Colors), apart from "door" (doorColor).
  rectangles) and walls = the inside faces of every stretch of wall round their union (a wall a wing opens into is
  The inner door's wood is the material "doorIn" (setting innerDoorColor, in Colors), apart from "door" (doorColor).
  in two pieces; names: the side or "w1Left" ...); x0..z1 stay the main part's. layout.mjs inRoom(room, rect) (the
  The inner door's wood is the material "doorIn" (setting innerDoorColor, in Colors), apart from "door" (doorColor).
  rect is in the union), roomBox; snapItem/problems/placeNew/furnisher use them. model.mjs: a wing on a walk-in
  The inner door's wood is the material "doorIn" (setting innerDoorColor, in Colors), apart from "door" (doorColor).
  building gets a passage in the house's wall (ops kind "open", up to the ceiling or the wing's height - 25 cm),
  The inner door's wood is the material "doorIn" (setting innerDoorColor, in Colors), apart from "door" (doorColor).
  inside faces on its walls, a floor, hollow collision (wall slabs, door gaps) and, in a barn, raw roof boards
  The inner door's wood is the material "doorIn" (setting innerDoorColor, in Colors), apart from "door" (doorColor).
  under its roof (rawUnder); the roof frame skips trusses over a valley wing. Barns and hen houses have wings too
  The inner door's wood is the material "doorIn" (setting innerDoorColor, in Colors), apart from "door" (doorColor).
  (the pasture and doorway stay on the main part; objectProblems warns when a wing stands in the pasture).
  The inner door's wood is the material "doorIn" (setting innerDoorColor, in Colors), apart from "door" (doorColor).
  Wings (PLAN step 4a, done; houses only, barns hide "Wings"): p.wings = [{id 1..4, wall (of the house), pos, width,
  The inner door's wood is the material "doorIn" (setting innerDoorColor, in Colors), apart from "door" (doorColor).
  depth, floors (0 = the house's)}], up to MAX_WINGS=4: L, T, U, Z. layout.mjs wingsOf(p) -> per wing {type
  The inner door's wood is the material "doorIn" (setting innerDoorColor, in Colors), apart from "door" (doorColor).
  valley|eave|gable|flat, s0, s1, ww, wd, floors, H, frames {w1End, w1Left, w1Right}, rect} or {off: why} (hip ends,
  The inner door's wood is the material "doorIn" (setting innerDoorColor, in Colors), apart from "door" (doorColor).
  no room, overlaps an earlier wing); liveWings; wallsOf(p) = every wall (window-list walls are "w{id}End|Left|Right").
  The inner door's wood is the material "doorIn" (setting innerDoorColor, in Colors), apart from "door" (doorColor).
  Same pitch/overhang as the house, own floors: a wing whose ridge reaches the house's eaves meets the slope in a
  The inner door's wood is the material "doorIn" (setting innerDoorColor, in Colors), apart from "door" (doorColor).
  valley (45 deg triangle cut by notch(); eave/gutter/dormers stop at WG.cut), a lower one ("eave") runs up to the
  The inner door's wood is the material "doorIn" (setting innerDoorColor, in Colors), apart from "door" (doorColor).
  wall under the eaves (width clamped to stay under their overhang), on a gable end an annex. model.mjs build():
  The inner door's wood is the material "doorIn" (setting innerDoorColor, in Colors), apart from "door" (doorColor).
  WINGS = [{wing, WG, topW}], buildWingBody/Roof per wing, wing walls built with their own height. Old saves (wing,
  The inner door's wood is the material "doorIn" (setting innerDoorColor, in Colors), apart from "door" (doorColor).
  wingWall ...; walls wingEnd...) migrate to wing 1 in sanitize. Windows under a wing are hidden (layoutWall cover).
  The inner door's wood is the material "doorIn" (setting innerDoorColor, in Colors), apart from "door" (doorColor).
  Per wing also pitch (0 = the house's; the valley is b = k + |a| tanW/tanP) and half (1½-plan, own setting once floors != 0).
  The inner door's wood is the material "doorIn" (setting innerDoorColor, in Colors), apart from "door" (doorColor).
  Downpipes: p.pipes = [{id, wall, pos 0..1 along the wall}] on walls with a gutter (layout.mjs eaveWalls: a gable roof's two
  The inner door's wood is the material "doorIn" (setting innerDoorColor, in Colors), apart from "door" (doorColor).
  eave walls, all four under hip, each wing's sides); autoPipes(p) from the downpipes count when a save has none; skipped where
  The inner door's wood is the material "doorIn" (setting innerDoorColor, in Colors), apart from "door" (doorColor).
  a wing stands against the wall; Downpipes section (count per wall, move one, place again).
  The inner door's wood is the material "doorIn" (setting innerDoorColor, in Colors), apart from "door" (doorColor).
  Editor: Wings section (list, add, per-wing sliders, floors, half floor, roof angle, remove). (The inside goes through the wings: see 4b above.)
  The inner door's wood is the material "doorIn" (setting innerDoorColor, in Colors), apart from "door" (doorColor).
  Game objects (PLAN step 2, done): src/editor/objects.mjs; p.objects = boxes {id, type, x, z, w, d, h, ix, iz} (sleep,
  The inner door's wood is the material "doorIn" (setting innerDoorColor, in Colors), apart from "door" (doorColor).
  food, bales, loading, pallets, info) and the pasture {type: "pasture", wall, a (m from the wall's start), b (m from its
  The inner door's wood is the material "doorIn" (setting innerDoorColor, in Colors), apart from "door" (doorColor).
  END: 0 = corner, so it stays at the corners when the building is resized; < 0 runs past), depth}. kind.objects =
  The inner door's wood is the material "doorIn" (setting innerDoorColor, in Colors), apart from "door" (doorColor).
  {types, required, pasture: {minWidth, depth}, defaults(p)}; cleanObjects adds missing required ones; defaults come from
  The inner door's wood is the material "doorIn" (setting innerDoorColor, in Colors), apart from "door" (doorColor).
  the old placeOnWall logic (henObjects/cowObjects with p.objects undefined), legacy pastureWall/fenceDepth/sleepPoint
  The inner door's wood is the material "doorIn" (setting innerDoorColor, in Colors), apart from "door" (doorColor).
  read in sanitize. withPasture (pasture.mjs) derives pastureWall, fenceDepth, pastureMid for the rest of the kind
  The inner door's wood is the material "doorIn" (setting innerDoorColor, in Colors), apart from "door" (doorColor).
  (doorway/hatch at pastureMid, troughs on [ea, eb]). House: a sleep object makes it a farmhouse (no sleepPoint
  The inner door's wood is the material "doorIn" (setting innerDoorColor, in Colors), apart from "door" (doorColor).
  setting). Editor: Game objects section + plan view (ob state, fitSite, drag boxes and the pasture's 3 handles).
  The inner door's wood is the material "doorIn" (setting innerDoorColor, in Colors), apart from "door" (doorColor).
  Inner doors: the wall's `door` setting is 0 none, 1 open doorway, 2 door that opens, 3 door that stays shut; def.leafOf(it) gives model.mjs
  The inner door's wood is the material "doorIn" (setting innerDoorColor, in Colors), apart from "door" (doorColor).
  buildInnerDoor the doorway, hinge end (hinge) and side (swing); the leaf is drawn with drawLeaf (openings.mjs) on both faces through
  The inner door's wood is the material "doorIn" (setting innerDoorColor, in Colors), apart from "door" (doorColor).
  openingKit(frame of the piece), and recorded in geo.doors with wall null, op.id 1000+id and its own trigger like the outer doors.
  The inner door's wood is the material "doorIn" (setting innerDoorColor, in Colors), apart from "door" (doorColor).
  Params can have `when(it)`: shown only when true.
  The inner door's wood is the material "doorIn" (setting innerDoorColor, in Colors), apart from "door" (doorColor).
  Every inside piece is free (layout.mjs snapItem): wall pieces (mount "wall") are drawn up against a wall or an inner wall only when put
  The inner door's wood is the material "doorIn" (setting innerDoorColor, in Colors), apart from "door" (doorColor).
  within WALL_REACH (0.4 m + half depth; inner faces 0.8 m) of it, a new piece (toWall) always goes to a wall; position sliders (fine = true:
  The inner door's wood is the material "doorIn" (setting innerDoorColor, in Colors), apart from "door" (doorColor).
  centimetres, no wall snapping) and a Rotation slider (any angle in degrees; inner walls only quarters). footprint() is the box round a
  The inner door's wood is the material "doorIn" (setting innerDoorColor, in Colors), apart from "door" (doorColor).
  turned piece; the build draws a turned box with the oriented box (meshBox in model.mjs), collision is that box.
  The inner door's wood is the material "doorIn" (setting innerDoorColor, in Colors), apart from "door" (doorColor).
  Inner walls (kinds/innerwall.mjs, "innerwall" in every walk-in catalog): a floor piece of length 1-20 m, 15 cm deep,
  The inner door's wood is the material "doorIn" (setting innerDoorColor, in Colors), apart from "door" (doorColor).
  with a doorway (open in the collision: def.solids, which buildInside uses instead of the footprint box when a piece
  The inner door's wood is the material "doorIn" (setting innerDoorColor, in Colors), apart from "door" (doorColor).
  has it) and wallpaper per side from WALLPAPERS (limewash, plain, striped, flowers, painted boards; surfaces
  The inner door's wood is the material "doorIn" (setting innerDoorColor, in Colors), apart from "door" (doorColor).
  paperPlain/paperStripe/paperFlower in surfaces.mjs, aged by age.mjs). Piece params can be choices (params[].options:
  The inner door's wood is the material "doorIn" (setting innerDoorColor, in Colors), apart from "door" (doorColor).
  an index, a list in the editor; def.snapWalls: layout.mjs endsToWalls draws a wall's ends to the room's walls within 0.25 m, and both
  The inner door's wood is the material "doorIn" (setting innerDoorColor, in Colors), apart from "door" (doorColor).
  ends fill the room there (snapItem(..., fine = true) is for the editor's position sliders: centimetres, no end snapping), wall pieces (mount wall) also stand against inner walls (innerFaces, def.runs), and it also meets other inner walls (their faces, T-junctions: snapItem(item, def, room, others, catalog)); length step 0.01). The wall goes up to c.ceil (kit field): the ceiling of a house, the walls' top in a barn.
  The inner door's wood is the material "doorIn" (setting innerDoorColor, in Colors), apart from "door" (doorColor).
  Walk-in everywhere (PLAN step 3, done): the farmhouse is walkIn too, with kind.ceiling (a ceiling over the ground
  The inner door's wood is the material "doorIn" (setting innerDoorColor, in Colors), apart from "door" (doorColor).
  floor; inside walls stop there; no roof frame; roof underside a soffit), doorsIn (its doors swing in), entrance
  The inner door's wood is the material "doorIn" (setting innerDoorColor, in Colors), apart from "door" (doorColor).
  ("porch" for a new first door), insideWalls {wall, low, kick} (barns default BARN_WALLS), furnish (board floor),
  The inner door's wood is the material "doorIn" (setting innerDoorColor, in Colors), apart from "door" (doorColor).
  catalog + autoFurnish in kinds/furniture.mjs (kitchen, stove, table, chair, bed, sofa, wardrobe, bookshelf, rug;
  The inner door's wood is the material "doorIn" (setting innerDoorColor, in Colors), apart from "door" (doorColor).
  tall pieces kept off windows). Pretend rooms only behind upper-floor windows (house forces interior: true; the
  The inner door's wood is the material "doorIn" (setting innerDoorColor, in Colors), apart from "door" (doorColor).
  "Rooms behind the windows" checkbox is gone). Every door has opens (default true): a door that doesn't open is
  The inner door's wood is the material "doorIn" (setting innerDoorColor, in Colors), apart from "door" (doorColor).
  drawn but gets no leaves/animation, closes the wall's collision and isn't kept clear inside (roomOf).
  The inner door's wood is the material "doorIn" (setting innerDoorColor, in Colors), apart from "door" (doorColor).
  Wall zones (PLAN step 1, done): wallSplit one|floor|height, splitHeight, lowerCladding, lowerColor; material
  The inner door's wood is the material "doorIn" (setting innerDoorColor, in Colors), apart from "door" (doorColor).
  "wallsLow" (in MATS, its own colour/texture/age) below the split, "walls" above (gables, dormers and porch gables
  The inner door's wood is the material "doorIn" (setting innerDoorColor, in Colors), apart from "door" (doorColor).
  are always "walls"); buildWall({split}) adds a drip board (trim) 9 cm in from the ends, broken at openings.
  The inner door's wood is the material "doorIn" (setting innerDoorColor, in Colors), apart from "door" (doorColor).
  src/editor/layout.mjs = a walk-in building's inside: roomOf, wall frames, doorSpan, placed pieces
  The inner door's wood is the material "doorIn" (setting innerDoorColor, in Colors), apart from "door" (doorColor).
  (p.items: {id, type, x, z, rot, ...params} in building coordinates), snapItem, problems, cleanItems.
  The inner door's wood is the material "doorIn" (setting innerDoorColor, in Colors), apart from "door" (doorColor).
  A walk-in kind has a catalog of pieces and autoFurnish(p); buildGeometry draws p.items.
  The inner door's wood is the material "doorIn" (setting innerDoorColor, in Colors), apart from "door" (doorColor).
  src/editor/editor.mjs = controls + three.js r128 preview, mounted by Editor.tsx.
  The inner door's wood is the material "doorIn" (setting innerDoorColor, in Colors), apart from "door" (doorColor).
  src/editor/interior.mjs = paints the room atlas (layout: ATLAS in model.mjs) and glass texture.
  The inner door's wood is the material "doorIn" (setting innerDoorColor, in Colors), apart from "door" (doorColor).
  src/editor/places.mjs = placeOnWall(walls, wall, def)/placeOnBuilding(def): where the kinds put their game objects to start with (the
  The inner door's wood is the material "doorIn" (setting innerDoorColor, in Colors), apart from "door" (doorColor).
  objects themselves are in objects.mjs; p.places and cleanPlaces are from before and no longer used).
  The inner door's wood is the material "doorIn" (setting innerDoorColor, in Colors), apart from "door" (doorColor).
  gamePlaces(p) (model.mjs) gives the preview the same boxes and icons the export writes.
  The inner door's wood is the material "doorIn" (setting innerDoorColor, in Colors), apart from "door" (doorColor).
  src/editor/age.mjs = p.age (0-60 years): agedColor (via colorFor) and weather() on texture shade/height/marks
  The inner door's wood is the material "doorIn" (setting innerDoorColor, in Colors), apart from "door" (doorColor).
  (Mk codes coloured by MASK_RGB: mortar, bare wood, moss, rust, lichen, white rust); tiling, so no
  The inner door's wood is the material "doorIn" (setting innerDoorColor, in Colors), apart from "door" (doorColor).
  position-dependent dirt (e.g. a band at the wall bottom) yet.
  The inner door's wood is the material "doorIn" (setting innerDoorColor, in Colors), apart from "door" (doorColor).
  src/editor/openings.mjs = the window and door style library (WINDOW_STYLES: casement, sprojs, stall, single,
  The inner door's wood is the material "doorIn" (setting innerDoorColor, in Colors), apart from "door" (doorColor).
  hatch; DOOR_STYLES: plain, plank, zbrace, xbrace, panel, sliding), drawn with a kit in wall coordinates
  The inner door's wood is the material "doorIn" (setting innerDoorColor, in Colors), apart from "door" (doorColor).
  (box/slab, skip leaves out a face lying on another). p.winStyle / p.doorStyle per building; each entry of
  The inner door's wood is the material "doorIn" (setting innerDoorColor, in Colors), apart from "door" (doorColor).
  p.windows has type "window" | "door" (doors only on floor 0, made from a window in the editor) and style
  The inner door's wood is the material "doorIn" (setting innerDoorColor, in Colors), apart from "door" (doorColor).
  ("default" = the building's). Every door is the same (no main door): each has porch "none" | "shed" | "gable"
  The inner door's wood is the material "doorIn" (setting innerDoorColor, in Colors), apart from "door" (doorColor).
  | "porch" with porchW/porchD (a doorstep where there's no porch); a building always has at least one door (old
  The inner door's wood is the material "doorIn" (setting innerDoorColor, in Colors), apart from "door" (doorColor).
  saves and presets get one from doorWall/doorPos/doorW/doorH/entrance, legacyDoor). The sleep point is at the first
  The inner door's wood is the material "doorIn" (setting innerDoorColor, in Colors), apart from "door" (doorColor).
  door; animal kinds keep the pasture and outside places off walls with a door (pasture.mjs doorWalls,
  The inner door's wood is the material "doorIn" (setting innerDoorColor, in Colors), apart from "door" (doorColor).
  pastureWallFor). Any window or door can move to another wall in the editor. Doors over 1.4 m are a pair.
  The inner door's wood is the material "doorIn" (setting innerDoorColor, in Colors), apart from "door" (doorColor).
  Walk-in buildings: geo.doors [{wall, op, slide, leaves: [{hinge, motion {rotation} | {translation}, parts
  The inner door's wood is the material "doorIn" (setting innerDoorColor, in Colors), apart from "door" (doorColor).
  {mat: [from, to]}, box}]}]; export: door{n}Leaf{k}Hinge > door{n}Leaf{k} (moved) > meshes + collision,
  The inner door's wood is the material "doorIn" (setting innerDoorColor, in Colors), apart from "door" (doorColor).
  one animatedObject + trigger per door; the static parts leave out what leaves carry (exceptRanges).
  The inner door's wood is the material "doorIn" (setting innerDoorColor, in Colors), apart from "door" (doorColor).
  Door ironwork is its own material "iron".
  The inner door's wood is the material "doorIn" (setting innerDoorColor, in Colors), apart from "door" (doorColor).
  src/editor/surfaces.mjs = tileable inside surfaces (concrete, whitewash, grime, timber, wood, boards, galv,
  The inner door's wood is the material "doorIn" (setting innerDoorColor, in Colors), apart from "door" (doorColor).
  steel, plastic, rubber, straw, litter): shade + height maps, no DOM. Fittings are painted paint(colour, surface);
  The inner door's wood is the material "doorIn" (setting innerDoorColor, in Colors), apart from "door" (doorColor).
  each vertex carries its surface (G.fittings.s), uvs count texture copies (grain surfaces lay v along the
  The inner door's wood is the material "doorIn" (setting innerDoorColor, in Colors), apart from "door" (doorColor).
  longest edge). Export: one diffuse per colour+surface (textures/fit_<surf>_<hex>.png, fittingTextures) and one
  The inner door's wood is the material "doorIn" (setting innerDoorColor, in Colors), apart from "door" (doorColor).
  normal map per surface; the preview shows a grey map over vertex colours (drawFittingSurfaces). A walk-in
  The inner door's wood is the material "doorIn" (setting innerDoorColor, in Colors), apart from "door" (doorColor).
  building's roof underside (above the wall tops) is raw roof boards in fittings; the plinth is concrete and doors
  The inner door's wood is the material "doorIn" (setting innerDoorColor, in Colors), apart from "door" (doorColor).
  painted wood (surfaceSpec).
  The inner door's wood is the material "doorIn" (setting innerDoorColor, in Colors), apart from "door" (doorColor).
  Imported items ("My items", /items page): props from Giants Editor, stored per user in the DB
  The inner door's wood is the material "doorIn" (setting innerDoorColor, in Colors), apart from "door" (doorColor).
  (assets + asset_files, /api/assets, files as blobs, 50 MB per item). The game loads an item's own
  The inner door's wood is the material "doorIn" (setting innerDoorColor, in Colors), apart from "door" (doorColor).
  i3d via a ReferenceNode (its .shapes is encrypted, we can't read it); the preview draws the .obj
  The inner door's wood is the material "doorIn" (setting innerDoorColor, in Colors), apart from "door" (doorColor).
  GE exports of it (same coordinates: its bounding box places the reference). src/editor/assets.mjs
  The inner door's wood is the material "doorIn" (setting innerDoorColor, in Colors), apart from "door" (doorColor).
  (pure: readI3d, readObj, placement, withAssets ...), item types "asset:<id>"; model.mjs setAssets/
  The inner door's wood is the material "doorIn" (setting innerDoorColor, in Colors), apart from "door" (doorColor).
  catalogFor/usedAssets (items of unknown assets are kept as stand-ins, never dropped); exports pack
  The inner door's wood is the material "doorIn" (setting innerDoorColor, in Colors), apart from "door" (doorColor).
  the item files in items/<name>_<id>/ (not the .obj). src/editor/itemView.mjs = the page's 3D view.
  The inner door's wood is the material "doorIn" (setting innerDoorColor, in Colors), apart from "door" (doorColor).
  The admin can share an item with everyone (assets.shared, added by a migration on open): listed
  The inner door's wood is the material "doorIn" (setting innerDoorColor, in Colors), apart from "door" (doorColor).
  and usable by all, changed or deleted only by its owner; API sends shared and mine.
  The inner door's wood is the material "doorIn" (setting innerDoorColor, in Colors), apart from "door" (doorColor).
  Photo guide (PLAN step 5, done): fromPhotos.mjs photoRequest(kind) -> {guide, schema}; the answer is {seen, settings,
  The inner door's wood is the material "doorIn" (setting innerDoorColor, in Colors), apart from "door" (doorColor).
  openings (each with opens), notes, pasture, wings (parts: wall, along, width, depth, floors, half, pitch), objects
  The inner door's wood is the material "doorIn" (setting innerDoorColor, in Colors), apart from "door" (doorColor).
  (game boxes beside a wall: type, wall, along, out)}; guide paragraphs for shape and parts, wall materials (wallSplit),
  The inner door's wood is the material "doorIn" (setting innerDoorColor, in Colors), apart from "door" (doorColor).
  doors that open, game objects. applyAnswer turns it into settings (objects placed beside the wall, the kind's other
  The inner door's wood is the material "doorIn" (setting innerDoorColor, in Colors), apart from "door" (doorColor).
  objects stay); answerProblems(kind, answer) lists what is wrong (wings left out, objects in the building or pasture,
  The inner door's wood is the material "doorIn" (setting innerDoorColor, in Colors), apart from "door" (doorColor).
  hidden windows, too many animals), shown under the summary in the wizard with a button that adds them to the notes.
  The inner door's wood is the material "doorIn" (setting innerDoorColor, in Colors), apart from "door" (doorColor).
  Templates from photos (admin only, for everyone's "New"): /admin/templates/new is a wizard (kind + name, photos
  The inner door's wood is the material "doorIn" (setting innerDoorColor, in Colors), apart from "door" (doorColor).
  shrunk to 1568 px in the browser + notes, Claude's suggestion); store templates + template_photos, /api/templates
  The inner door's wood is the material "doorIn" (setting innerDoorColor, in Colors), apart from "door" (doorColor).
  (published, all users), /api/admin/templates (+ /{id}/suggest, needs ANTHROPIC_API_KEY, else 503 vision_off and the
  The inner door's wood is the material "doorIn" (setting innerDoorColor, in Colors), apart from "door" (doorColor).
  wizard offers the kind's presets); or the chat way: chatPrompt(kind, notes) to copy into claude.ai, readAnswer(pasted) -> PATCH
  The inner door's wood is the material "doorIn" (setting innerDoorColor, in Colors), apart from "door" (doorColor).
  suggestion; GET /api/admin/vision says whether the API way is on. src/editor/fromPhotos.mjs builds the guide + JSON schema per kind (photoRequest)
  The inner door's wood is the material "doorIn" (setting innerDoorColor, in Colors), apart from "door" (doorColor).
  and turns the answer {seen, settings, openings, notes} into settings (applyAnswer -> sanitize). The admin adjusts
  The inner door's wood is the material "doorIn" (setting innerDoorColor, in Colors), apart from "door" (doorColor).
  in an ordinary project opened with ?template=ID (photo strip, Claude's notes, Publish template = settings +
  The inner door's wood is the material "doorIn" (setting innerDoorColor, in Colors), apart from "door" (doorColor).
  snapshot). Chart: claude.apiKey / claude.existingSecret. Not yet tried with a real key.
  The inner door's wood is the material "doorIn" (setting innerDoorColor, in Colors), apart from "door" (doorColor).
- charts/house-to-i3d = Helm chart (SQLite on a PVC, or Postgres in-release/external);
  The inner door's wood is the material "doorIn" (setting innerDoorColor, in Colors), apart from "door" (doorColor).
  charts/test.sh renders and checks every setup.
  The inner door's wood is the material "doorIn" (setting innerDoorColor, in Colors), apart from "door" (doorColor).
- docker-compose.yml runs api + web; CI in .github/workflows/ci.yml pushes
  The inner door's wood is the material "doorIn" (setting innerDoorColor, in Colors), apart from "door" (doorColor).
  house-to-i3d-api and house-to-i3d-web to Docker Hub on releases (vX.Y.Z), then
  The inner door's wood is the material "doorIn" (setting innerDoorColor, in Colors), apart from "door" (doorColor).
  the chart to oci://registry-1.docker.io/rehn/house-to-i3d.
  The inner door's wood is the material "doorIn" (setting innerDoorColor, in Colors), apart from "door" (doorColor).

  The inner door's wood is the material "doorIn" (setting innerDoorColor, in Colors), apart from "door" (doorColor).
## How we work
  The inner door's wood is the material "doorIn" (setting innerDoorColor, in Colors), apart from "door" (doorColor).
- TDD: write the failing test first, then the code.
  The inner door's wood is the material "doorIn" (setting innerDoorColor, in Colors), apart from "door" (doorColor).
- Backend tests: cd backend && go test ./...  (TEST_DATABASE_URL=postgres://... also runs
  The inner door's wood is the material "doorIn" (setting innerDoorColor, in Colors), apart from "door" (doorColor).
  the store tests on Postgres; CI does both)
  The inner door's wood is the material "doorIn" (setting innerDoorColor, in Colors), apart from "door" (doorColor).
- Chart tests: bash charts/test.sh (helm v4 in WSL at /usr/local/bin)
  The inner door's wood is the material "doorIn" (setting innerDoorColor, in Colors), apart from "door" (doorColor).
- Frontend tests: cd frontend && npm test (node --test, no browser needed)
  The inner door's wood is the material "doorIn" (setting innerDoorColor, in Colors), apart from "door" (doorColor).

  The inner door's wood is the material "doorIn" (setting innerDoorColor, in Colors), apart from "door" (doorColor).
## Status
  The inner door's wood is the material "doorIn" (setting innerDoorColor, in Colors), apart from "door" (doorColor).
- Go tests (60) pass on SQLite (Postgres run only in CI so far), go vet is clean. Frontend tests (451) pass. test/flicker.test.mjs finds coplanar overlapping faces (z-fighting) on the outside, in openings too, for every window and door style.
  The inner door's wood is the material "doorIn" (setting innerDoorColor, in Colors), apart from "door" (doorColor).
- Cow barn (kinds/cow.mjs): cowHusbandryPasture (no milk, like cowBarnSmall), automatic water, feed
  The inner door's wood is the material "doorIn" (setting innerDoorColor, in Colors), apart from "door" (doorColor).
  and water troughs outside on the pasture wall (kind.outside), a plain walk-through doorway for the
  The inner door's wood is the material "doorIn" (setting innerDoorColor, in Colors), apart from "door" (doorColor).
  cows (openings with plain: true; tall openings get a collision gap), feed pad + bale trigger
  The inner door's wood is the material "doorIn" (setting innerDoorColor, in Colors), apart from "door" (doorColor).
  outside the fence. Presets: ladugard, fahus, losdriftsstall. Not yet tested in-game.
  The inner door's wood is the material "doorIn" (setting innerDoorColor, in Colors), apart from "door" (doorColor).
  Next for cows: a dairy (cowHusbandryBarnMilk with the game's milking robots), straw and manure.
  The inner door's wood is the material "doorIn" (setting innerDoorColor, in Colors), apart from "door" (doorColor).
- Sheep barn (kinds/sheep.mjs, kind "sheep", sheepHusbandry like the base game's sheep barns): built on cow.mjs, which takes a
  The inner door's wood is the material "doorIn" (setting innerDoorColor, in Colors), apart from "door" (doorColor).
  config (COW / SHEEP: count, minWidth, pallets, animal, fill, fence; cowYard/outsideOf/sceneOf/defaultsOf(cfg)). Wool (WOOL GOATMILK)
  The inner door's wood is the material "doorIn" (setting innerDoorColor, in Colors), apart from "door" (doorColor).
  pallets as a game object "pallets" (kind.objects.labels renames it, objectInfo(kind, type)); palletLines/cornerStripes live in
  The inner door's wood is the material "doorIn" (setting innerDoorColor, in Colors), apart from "door" (doorColor).
  pasture.mjs. kind.glyph and kind.yard(geo, p) tell the preview which animal icon and fence to draw. Pieces: hay trough, hay rack,
  The inner door's wood is the material "doorIn" (setting innerDoorColor, in Colors), apart from "door" (doorColor).
  water bowl, lambing pen, bale. Presets: farhus, farstall, storfarstall. Automatic water; not yet tried in-game.
  The inner door's wood is the material "doorIn" (setting innerDoorColor, in Colors), apart from "door" (doorColor).
- Shared: kinds/pasture.mjs (yardFrame: fence, feed/other side), layout.mjs furnisher (autoFurnish
  The inner door's wood is the material "doorIn" (setting innerDoorColor, in Colors), apart from "door" (doorColor).
  helpers), fieldsFor(kind) (kinds can share a key with different ranges), roof ventilators.
  The inner door's wood is the material "doorIn" (setting innerDoorColor, in Colors), apart from "door" (doorColor).
- Hen house: pastureWall (fence + a 40 x 50 cm hen hatch, kind.openings) moves off a wall with a door;
  The inner door's wood is the material "doorIn" (setting innerDoorColor, in Colors), apart from "door" (doorColor).
  feed pad and egg pallets go on walls without a door where they can. No gate in the fence (user's choice).
  The inner door's wood is the material "doorIn" (setting innerDoorColor, in Colors), apart from "door" (doorColor).
  Canopies on walk-in buildings stay below the eaves (else they showed inside).
  The inner door's wood is the material "doorIn" (setting innerDoorColor, in Colors), apart from "door" (doorColor).
  Walk-in insides: exposed roof frame (buildRoofFrame: rafters, ridge beam, tie beams, collar ties),
  The inner door's wood is the material "doorIn" (setting innerDoorColor, in Colors), apart from "door" (doorColor).
  a grimy band and a tarred kickboard on the inside walls, and a round galvanised duct under each ventilator (ventDuct);
  The inner door's wood is the material "doorIn" (setting innerDoorColor, in Colors), apart from "door" (doorColor).
  the ventilator box's bottom follows the roof so it never shows inside (test/barn-inside.test.mjs).
  The inner door's wood is the material "doorIn" (setting innerDoorColor, in Colors), apart from "door" (doorColor).
  Inside pieces draw with a kit (box, cyl, cone, rod, pipe, board, paint; see kinds/props.mjs, which
  The inner door's wood is the material "doorIn" (setting innerDoorColor, in Colors), apart from "door" (doorColor).
  also has tone/shade, arc, strawBale, strawLitter). test/pieces.test.mjs keeps every piece inside its
  The inner door's wood is the material "doorIn" (setting innerDoorColor, in Colors), apart from "door" (doorColor).
  footprint and height (hanging parts up to c.H) and asks for some detail. Each fittings colour is
  The inner door's wood is the material "doorIn" (setting innerDoorColor, in Colors), apart from "door" (doorColor).
  its own i3d part, so tones are kept to a few per material.
  The inner door's wood is the material "doorIn" (setting innerDoorColor, in Colors), apart from "door" (doorColor).
- Kinds: settings.kind "house" | "chicken" | "cow" | "sheep", fixed after creation. "New" and "My buildings" group by kind
  The inner door's wood is the material "doorIn" (setting innerDoorColor, in Colors), apart from "door" (doorColor).
  (groupByKind, kind.plural); the project list API returns each project's kind (from data.kind, read in SQL).
  The inner door's wood is the material "doorIn" (setting innerDoorColor, in Colors), apart from "door" (doorColor).
  Chicken barns export as chickenHusbandryPasture (modelled on data/placeables/rudolfHormann/
  The inner door's wood is the material "doorIn" (setting innerDoorColor, in Colors), apart from "door" (doorColor).
  chickenBarnBig, 360 hens). Walk-in kinds (kind.walkIn): inside wall faces, hollow collision, a door
  The inner door's wood is the material "doorIn" (setting innerDoorColor, in Colors), apart from "door" (doorColor).
  that opens (every door: see openings.mjs above),
  The inner door's wood is the material "doorIn" (setting innerDoorColor, in Colors), apart from "door" (doorColor).
  see-through windows, and an inside
  The inner door's wood is the material "doorIn" (setting innerDoorColor, in Colors), apart from "door" (doorColor).
  from kind.furnish(). Confirmed in-game: hens show, door opens, walk-in collision.
  The inner door's wood is the material "doorIn" (setting innerDoorColor, in Colors), apart from "door" (doorColor).
  Not yet confirmed: feeding, fence joining the corners, warning stripes, see-through windows, coop interior.
  The inner door's wood is the material "doorIn" (setting innerDoorColor, in Colors), apart from "door" (doorColor).
- docs/PLAN.md (Swedish) is the current plan, agreed Nov 2026: one model for every building (parts = rectangles
  The inner door's wood is the material "doorIn" (setting innerDoorColor, in Colors), apart from "door" (doorColor).
  attached to each other, two wall zones, ground floor walk-in everywhere, doors openable or not, game objects as
  The inner door's wood is the material "doorIn" (setting innerDoorColor, in Colors), apart from "door" (doorColor).
  placeable objects). Steps: 1 wall zones, 2 game objects, 3 walk-in for all + openable doors, 4 parts, 5 Claude guide.
  The inner door's wood is the material "doorIn" (setting innerDoorColor, in Colors), apart from "door" (doorColor).
- Agreed plan with the user (old saves may break; aim: a good, user-friendly app):
  The inner door's wood is the material "doorIn" (setting innerDoorColor, in Colors), apart from "door" (doorColor).
  1. done: core + kind modules. 2. done: interior as a list of placed pieces (catalog per kind,
  The inner door's wood is the material "doorIn" (setting innerDoorColor, in Colors), apart from "door" (doorColor).
  snapping rules, "Fill automatically"; editor has an Inside section with fill/clear). 3. done:
  The inner door's wood is the material "doorIn" (setting innerDoorColor, in Colors), apart from "door" (doorColor).
  "Arrange the inside" (editor.mjs, ins state): Plan (orthographic, cut at 1.3 m) / 3D (cut under
  The inner door's wood is the material "doorIn" (setting innerDoorColor, in Colors), apart from "door" (doorColor).
  the eaves) via renderer.clippingPlanes, palette, drag with snap, turn, remove, undo/redo
  The inner door's wood is the material "doorIn" (setting innerDoorColor, in Colors), apart from "door" (doorColor).
  (layout.mjs History, itemAt, placeNew, rotateItem). Checked end to end with headless Chromium.
  The inner door's wood is the material "doorIn" (setting innerDoorColor, in Colors), apart from "door" (doorColor).
  4. started: cows (above). Then sheep, sheds and a vehicle workshop ("fordonsverkstad") as new kinds.
  The inner door's wood is the material "doorIn" (setting innerDoorColor, in Colors), apart from "door" (doorColor).
  The user wants Swedish building designs.
  The inner door's wood is the material "doorIn" (setting innerDoorColor, in Colors), apart from "door" (doorColor).
- npm run build succeeds.
  The inner door's wood is the material "doorIn" (setting innerDoorColor, in Colors), apart from "door" (doorColor).
- go.sum and package-lock.json are committed.
  The inner door's wood is the material "doorIn" (setting innerDoorColor, in Colors), apart from "door" (doorColor).

  The inner door's wood is the material "doorIn" (setting innerDoorColor, in Colors), apart from "door" (doorColor).
## Dev environment (WSL)
  The inner door's wood is the material "doorIn" (setting innerDoorColor, in Colors), apart from "door" (doorColor).
- ./dev.sh starts API (:8080) + Next dev server (:3000); data in .dev/ (gitignored),
  The inner door's wood is the material "doorIn" (setting innerDoorColor, in Colors), apart from "door" (doorColor).
  ./dev.sh --reset wipes it. Reachable from the Windows browser at localhost:3000.
  The inner door's wood is the material "doorIn" (setting innerDoorColor, in Colors), apart from "door" (doorColor).
- Node 22 and gh live in ~/.local/bin (installed without sudo).
  The inner door's wood is the material "doorIn" (setting innerDoorColor, in Colors), apart from "door" (doorColor).
- Docker is not integrated into WSL; Docker Desktop runs on the Windows side.
  The inner door's wood is the material "doorIn" (setting innerDoorColor, in Colors), apart from "door" (doorColor).

  The inner door's wood is the material "doorIn" (setting innerDoorColor, in Colors), apart from "door" (doorColor).
## FS25 reference (read-only, on the Windows side)
  The inner door's wood is the material "doorIn" (setting innerDoorColor, in Colors), apart from "door" (doorColor).
- Game install: /c/Program Files (x86)/Farming Simulator 2025 (Git Bash path).
  The inner door's wood is the material "doorIn" (setting innerDoorColor, in Colors), apart from "door" (doorColor).
  shared/xml/schema/placeable.xsd is the authoritative placeable XML schema;
  The inner door's wood is the material "doorIn" (setting innerDoorColor, in Colors), apart from "door" (doorColor).
  data/placeables/brandless/gardenSheds/level01 is the template the export's
  The inner door's wood is the material "doorIn" (setting innerDoorColor, in Colors), apart from "door" (doorColor).
  area nodes (clear/level/test/tipOcclusion) and collision filter follow.
  The inner door's wood is the material "doorIn" (setting innerDoorColor, in Colors), apart from "door" (doorColor).
