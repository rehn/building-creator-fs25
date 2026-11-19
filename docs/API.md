# API for other programs

House to i3d has an HTTP API for programs that want to use its buildings, for example a map builder that places them on a map.
This page says what exists today, and (clearly marked) what is planned for making buildings from OpenStreetMap footprints.

| Part | Status |
|---|---|
| [Reading buildings and their files](#reading-buildings-v1) (`GET /api/v1/...`) | Works today |
| [What a token may do](#get-apiv1me) (`GET /api/v1/me`) | Works today |
| [Folders](#folders) (`?folder=`, `GET /api/v1/folders`) | Works today |
| [Creating buildings and sending their files](#writing-buildings-v1-write-tokens) (`POST /api/v1/buildings`, `PUT .../model`, tokens that may write) | Works today (not yet tried against a real map program) |
| [Generating buildings from OSM footprints](#generating-buildings-from-osm-planned) (`POST /api/v1/generate`) | **Planned, not available yet.** It will be built on the two above; see `docs/PLAN_OSM.md` |

## Basics

**Base address.** The address people open the app on (the public URL), for example `https://fs25-buildings.example.se`. Inside a Kubernetes
cluster you can call the API service directly: `http://<release>-building-creator-fs25-api:8080` (the same paths).

**Token.** Make one in the app under **API** (`/api-access`): give it the name of your program and copy the token, which is shown only once.
It starts with `bc_`. A user can have up to 20. Send it on every request:

```
Authorization: Bearer bc_...
```

A token belongs to the user who made it and sees only that user's buildings. A token **reads** by default. Tick **May create buildings** when making it
to get a token that can also [create buildings and send their files](#writing-buildings-v1-write-tokens); it can still never delete a building or change one a person made.
A token opens only `/api/v1/*`, not the app's own routes. Delete it in the app to lock it out.

**Errors** are JSON with a machine-readable code and a message for people:

```json
{ "error": "unauthorized", "message": "Send a valid API token as \"Authorization: Bearer <token>\"." }
```

| Status | When |
|---|---|
| 401 `unauthorized` | No token, or not a valid one |
| 403 `forbidden` | The token only reads and the request writes |
| 400 `invalid_...` | A field is wrong: `invalid_folder`, `invalid_source_id`, `invalid_name`, `invalid_data`, `invalid_version`, `invalid_model` (the message says what) |
| 404 | The building does not exist (or is not yours), or it has no model files yet (see `hasModel`) |
| 304 | The file is unchanged since the `ETag` you sent in `If-None-Match` |

**CORS.** `Access-Control-Allow-Origin: *` on `/api/v1/*` (GET, POST, PUT), so a browser program can call it too. A token goes in a header and never in a cookie, so
another site cannot use a user's browser to make requests here.

**Units.** Metres. The building's own axes: x along the front wall, y up, front wall towards +z (see [Placement](#placement)).

## Reading buildings (v1)

### `GET /api/v1/me`

What the token you sent may do, for a settings page with a "Test" button. Nothing about the person.

```json
{ "tokenName": "Kartan", "write": true, "appVersion": "0.6.7" }
```

`write` is `true` for a token made with *May create buildings*. `appVersion` is the release the API runs. A missing or deleted token gets `401 unauthorized`.

### `GET /api/v1/buildings`

All of the user's buildings.

```json
{
  "buildings": [
    {
      "id": "0e7c3f5a...",
      "name": "Storgatan 4",
      "kind": "house",
      "icon": "/api/v1/buildings/0e7c3f5a.../icon",
      "i3d": "/api/v1/buildings/0e7c3f5a.../model.i3d",
      "obj": "/api/v1/buildings/0e7c3f5a.../model.obj",
      "mtl": "/api/v1/buildings/0e7c3f5a.../model.mtl",
      "mod": "/api/v1/buildings/0e7c3f5a.../mod.zip",
      "version": 7,
      "hasModel": true,
      "updatedAt": "2026-11-19T19:05:52Z",
      "folder": "Hallsberg",
      "sourceId": "way/123456",
      "generated": true
    }
  ]
}
```

| Field | Meaning |
|---|---|
| `id` | Stable id. Use it in the paths below |
| `name` | The name the user gave it |
| `kind` | `house`, `chicken`, `cow`, `sheep`, `shed`, `dealership`, `defaultdealer` |
| `icon` | Path of the picture (PNG or JPEG), empty if there is none |
| `i3d`, `obj`, `mtl`, `mod` | Paths of the files (`mod` is `mod.zip`, the editor's export; the game mod is `/api/v1/buildings/{id}/game-mod.zip`). Relative to the base address |
| `version` | Goes up every time the building is saved with its files. The files are those of this version. Keep what you made from a file for as long as the version is the same |
| `hasModel` | `false` when the building has not been saved since its files were kept. Its files give 404 until it is saved (opened and saved in the editor, or generated) |
| `updatedAt` | When it was last changed |
| `folder` | The map the building belongs to, `""` for none (see [Folders](#folders)) |
| `sourceId`, `generated`, `edited` | For buildings a program made: its own id for it, `generated: true`, and `edited: true` once a person has changed it in the app (then it is left alone when generated again). Left out when not set |

### `GET /api/v1/buildings/{id}`

The same fields, plus:

- `settings`: what the editor saves (the building's own settings; useful to read the size, the number of floors ...).
- `placeable` (only when it has a model): what a program needs to load the building's `house.xml`:
  `{ "type": "gardenShed", "customTypes": [] }`. A building of a kind the game has no type for (the dealership) has its own type,
  `"<mod name>.dealership"`, and `customTypes` lists the types its `modDesc.xml` defines. A program that copies `house.xml` into **its own mod**
  must define those types in its own `modDesc.xml` (`<placeableTypes>`) and write its own mod name in the type, or the game logs "Unknown type".
  The game's own types (`gardenShed` ...) need nothing.

### Files

All files carry `ETag: "v<version>"`. Send it back as `If-None-Match` to get `304` when nothing has changed.

| Path | What |
|---|---|
| `/api/v1/buildings/{id}/icon` | The picture of the building |
| `/api/v1/buildings/{id}/model.obj` | The model to draw: metres, y up, one group per material |
| `/api/v1/buildings/{id}/model.mtl` | The colours the `.obj` refers to (no textures: `map_Kd` is not written) |
| `/api/v1/buildings/{id}/game-mod.zip` | **The game mod**: `modDesc.xml`, `house.xml` (the placeable and its shop data), `house.i3d` (+ `house.i3d.shapes`), textures, imported items, shop picture. What a map builder unpacks into a map |
| `/api/v1/buildings/{id}/mod.zip`, `/model.zip` | What the editor's **Export model** gives: a folder with `house.i3d`, `placeable_snippet.xml`, textures and imported items (no `modDesc.xml`). `mod.zip` gives the game mod instead for a building saved before this export was kept; `model.zip` gives 404 then |
| `/api/v1/buildings/{id}/model.i3d` | `house.i3d` out of the zip, for Giants Editor |

```
curl -H "Authorization: Bearer bc_..." https://fs25-buildings.example.se/api/v1/buildings
curl -H "Authorization: Bearer bc_..." -o house.zip https://fs25-buildings.example.se/api/v1/buildings/0e7c3f5a.../game-mod.zip
```

### Folders

A building can be in a **folder**, which is the name of a map. The app groups on it, and the API filters on it:

- `GET /api/v1/buildings?folder=Hallsberg`: only the buildings in that folder. `?folder=` (empty): the ones in no folder. Without `folder`: all of them.
- `GET /api/v1/folders`: `{ "folders": [ { "name": "Askersund", "count": 1 }, { "name": "Hallsberg", "count": 2 } ] }`, by name. A folder exists while a building is in it.

A person moves a building between folders in the app (`folder` in `PATCH /api/projects/{id}`; `""` takes it out). Folder names are 1 to 80 characters without control characters.

### Writing buildings (v1, write tokens)

Needs a token made with **May create buildings**; a reading token gets `403 forbidden`.

**`POST /api/v1/buildings`** makes a building, or makes it again.

```json
{ "folder": "Hallsberg", "sourceId": "way/123456", "name": "Storgatan 4", "settings": { "kind": "house", "width": 10, "depth": 7 } }
```

| Field | Meaning |
|---|---|
| `folder` | The map's name, 1 to 80 characters. Required |
| `sourceId` | Your own id for the building (an OSM id, say), 1 to 200 characters. Required. The same id in the same folder is the same building, so sending it again updates it and never makes a second one, also when two requests come at once |
| `name` | The building's name in the app, 1 to 100 characters. Required |
| `settings` | What the editor saves (a JSON object under 1 MB; `kind` says `house`, `shed` ...). The editor fills in what is missing when it opens it. Required |

Answer: `201` when made, `200` otherwise: `{ "status": "created" | "updated" | "kept", "building": { ... } }`, `building` as in [Reading buildings](#reading-buildings-v1).

- `created`: a new building, at `version` 1.
- `updated`: it was made before and nobody has changed it, so its name and settings are replaced and its `version` goes up. **Its files are gone** (they were made from the old settings): send new ones.
- `kept`: **a person has changed it in the app since it was generated**, so nothing was changed. The answer has the building as it is (`edited: true`). Delete the building in the app to make it new again.

**`PUT /api/v1/buildings/{id}/model?version=N`** sends the files of a building made here, a `multipart/form-data` with `obj`, `mtl` and `mod` (and optionally `export`),
all files. `N` is the `version` the building has (the answer above): if it has changed since, the answer is `409 version_conflict` (a newer version is on its way).
`mod` must be a zip with `modDesc.xml`, `house.xml` and `house.i3d` at its root. Up to 64 MB. `hasModel` is `true` afterwards and the files are served as for any building.

A token cannot delete buildings or change any that a person made: there are no routes for it.

### Using a building in a map

`game-mod.zip` is a complete game mod: for a single building the program can add it to the map as it is. To put it in a map's own mod instead,
copy the files (`house.i3d`, `house.i3d.shapes`, `textures/`, ...) and the placeable XML (`house.xml`) into it, keep the relative paths, and
read `placeable` above for the type. The placeable XML is made for placement by the map (the building stands where the map puts it); the
position and rotation of each placed building are the map program's to set.

## Generating buildings from OSM (planned)

> **Not available yet.** This is the contract we intend to build (`docs/PLAN_OSM.md`, steps 4 and 5). Its parts exist: the conversion from a footprint
> (`frontend/src/editor/osm.mjs`), the files made without a browser (`headless.mjs`), and folders, write tokens and
> [`POST /api/v1/buildings` and `PUT .../model`](#writing-buildings-v1-write-tokens), which it will use. Tell us if something here does not fit your program: it is cheaper to change now.

A map program that has OpenStreetMap data sends the footprints and the tags; the app makes a building of each, files included, and answers
with where each one stands. Nothing needs to be opened in the editor.

### `POST /api/v1/generate`

Needs a token that may create buildings (see above).

```json
{
  "folder": "Hallsberg",
  "buildings": [
    {
      "id": "way/123456",
      "footprint": [[1204.5, 877.2], [1216.5, 877.2], [1216.5, 884.2], [1204.5, 884.2]],
      "tags": { "building": "house", "building:levels": "2", "roof:shape": "gabled", "addr:street": "Storgatan", "addr:housenumber": "4" }
    }
  ]
}
```

| Field | Meaning |
|---|---|
| `folder` | The name of the map. The buildings are kept in this folder in the app ("My buildings" groups by it) and `GET /api/v1/buildings?folder=Hallsberg` lists only them. Created if it does not exist. Required |
| `buildings[].id` | Your own id for the building, such as the OSM id. Generating the same `id` in the same `folder` again **updates** that building instead of making a second one (see [Regenerating](#regenerating)). Required |
| `buildings[].footprint` | The outline: `[[x, y], ...]` in **metres in the map's own plane**, x east and y north. The first point need not be repeated at the end; either winding. At least 3 points, an area of at least 6 m2 |
| `buildings[].tags` | The OSM tags of the way (any that you have). See [What the tags give](#what-the-tags-give) |
| `mode` (on the request) | `"placeable"` (default): the game mod, for a building that is bought and sold. `"scenery"`: the [scenery files](#scenery-mode-planned-for-generate-the-files-exist-in-code). Optionally `"textureSize"` (256, 512 or 1024) for scenery |

At most **20 buildings per request**; send the next batch in another request. Making a building takes a few seconds (the first one of a kind of surface
longer, because the textures are made; buildings with the same materials share them), so a request can take a minute: set a generous timeout.

Answer, `200`, in the order you sent them (a building that could not be made has `ok: false` and the others still are):

```json
{
  "folder": "Hallsberg",
  "buildings": [
    {
      "ok": true,
      "id": "way/123456",
      "buildingId": "0e7c3f5a...",
      "name": "Storgatan 4",
      "kind": "house",
      "version": 1,
      "placement": { "x": 1210.5, "y": 880.7, "angle": 0, "width": 12, "depth": 7 },
      "notes": ["No building:levels or height: 2 floors guessed from the size."],
      "gameMod": "/api/v1/buildings/0e7c3f5a.../game-mod.zip",
      "i3d": "/api/v1/buildings/0e7c3f5a.../model.i3d"
    },
    { "ok": false, "id": "way/99", "error": "The footprint is too small to be a building (under 6 m2)." }
  ]
}
```

| Field | Meaning |
|---|---|
| `buildingId` | The app's id: use it with the `GET /api/v1/buildings/{id}/...` paths above |
| `placement` | Where to put the building, see [Placement](#placement) |
| `notes` | What was guessed, fitted or left out. Show them to the user or log them |
| `ok: false` | `error` says why; the building was not made |

A request that is wrong as a whole (not JSON, no `folder`, more than 20 buildings, a bad token) gets a 4xx error as in [Basics](#basics).

### Scenery mode (planned for generate; the files exist in code)

A building a map uses as plain scenery (a `ReferenceNode` to `house.i3d` in the map's own i3d, not a placeable and not in the shop) does not want the game mod. With `"mode": "scenery"`
the files are:

- `house.i3d` and `house.i3d.shapes` (copy both, side by side, the same relative names) and `textures/*.dds`. **No** `modDesc.xml`, `house.xml` or pictures.
- The i3d is the outside shell: walls, trim, roof, glass, foundation, chimney, gutters and ironwork, with the doors drawn shut. The root node is `house` at `0 0 0` (the middle of the main part, the ground at y = 0, front wall towards +z).
- **A solid collision**: a box for the main part and one for each wing, as high as the walls (the roof has none). No doorways to walk into.
- **None of what the placeable XML uses**: no `clearAreas`, `levelAreas`, `testAreas`, `tipOcclusionUpdateAreas`, `indoorAreas`, no door triggers or animated doors, no kind-specific nodes (workshop, shop, navigation, pasture), no inside (furniture, curtains, rooms) and no user attributes.
- The glass is opaque (there is nothing behind it).
- Textures are 512 px by default (the outside's surfaces only: about 12 files, 2 MB for a house; `"textureSize": 256` or `1024` also work). Everything the i3d refers to is a relative `textures/...` path.

The files exist in the code (`makeSceneryFiles` in `frontend/src/editor/headless.mjs`, `i3dFiles(p, {scenery: true})`); the generate route will return them for `"mode": "scenery"`.

### Placement

`placement` is for the **middle of the main part** of the building, in the same plane as the footprint you sent:

- `x`, `y`: metres, x east, y north.
- `angle`: degrees **counter-clockwise from east** (as seen from above, north up) of the building's **width axis**, its x axis.
- `width`, `depth`: the main part's size in metres. Wings stand outside this rectangle.

In the building's own coordinates the front wall is at `+z` (z points towards the viewer when looking at the plan from above, so **north is -z**).
Turning that into the game's coordinates is the map program's job: a map whose world x is east and world z is south uses `worldX = x`, `worldZ = -y`,
and rotates the building about the vertical axis by `angle`. The sign of the rotation in the game's i3d convention is **not yet checked in the game**; try one L-shaped building and flip it if it comes out mirrored.

### What the tags give

Everything is optional. Missing tags get a sensible value, and what was guessed is in `notes`.

| Tag | Becomes |
|---|---|
| `building` | The kind. `garage`, `garages`, `carport`, `shed`, `barn`, `farm_auxiliary`, `warehouse`, `service`, `hut`, `storage`, `outbuilding`, `cowshed`, `stable`, `sty`, `greenhouse`, `industrial`, `roof`, `hangar`, `agricultural`, `silo` give a `shed`; everything else (`house`, `detached`, `residential`, `yes`, `apartments` ...) a `house` |
| `building:levels`, else `height` | Floors, 1 to 3 (`height` / 3 when there are no levels). More than 3 is cut to 3. Without either: 1 floor under 60 m2, else 2 (houses), 1 (sheds) |
| `roof:levels` (1 or more) | A half floor in the roof (houses) |
| `roof:shape` | `gabled`, `gable` give a gable roof; `hipped`, `hip`, `half-hipped`, `pyramidal` a hip roof; `flat` a flat roof. Other shapes (`gambrel`, `mansard`, `skillion` ...) become a gable roof, said in `notes`. A hip roof on a building with wings becomes a gable roof |
| `roof:angle`, else `roof:height` | The roof pitch in degrees, 5 to 60 |
| `building:colour`, `colour` | The wall colour: `#rrggbb`, `#rgb` or one of white, red, yellow, brown, grey/gray, black, green, blue, beige, orange, cream |
| `roof:colour` | The roof colour, same forms |
| `roof:material` | `tiles`, `roof_tiles`, `concrete`, `clay`: concrete tiles. `metal`, `metal_sheet`, `copper`, `zinc`, `steel`, `tin`: Swedish sheet metal. `corrugated_iron`, `corrugated`: corrugated sheet metal |
| `building:material` | `wood`, `timber`, `wood_frame`: board and batten. `brick`, `stone`, `concrete`, `plaster`, `stucco`, `cement_block`: plaster. `metal`, `steel`: corrugated sheet metal |
| `name`, else `addr:street` + `addr:housenumber`, else the `id` | The building's name in the app |

### The shape

The building is a rectangle (the **main part**) and up to 4 **wings**, which are the arms of an L, T or U shape. The app finds them like this:

1. The main direction of the outline's edges (weighted by length, quarter turns counting as the same) decides how the building faces. The long side of the main part is its width.
2. The main part is the largest rectangle that fits inside the outline. Its edges move to a corner of the outline when one is within 30 cm, so a rectangular building gets its exact size.
3. Each wing is the largest rectangle in the strip outside one of the main part's four sides: at least 2 m wide, 1.5 m deep and 8 m2. Wings with less than 15 m2 get one floor.
4. What is left of the outline (round parts, thin bumps, parts too small to be a wing) is dropped. If it is more than 5% of the outline, `notes` says how much.

`shed` buildings are made as one rectangle (no wings). The shapes are an approximation: the user opens the ones that matter in the editor and improves them.
A wing on a wing, windows, doors and rooms are not made from OSM data: the building gets the app's standard door and windows.

### Regenerating

Sending the same `id` in the same `folder` again replaces what was generated, with one exception: a building that a person has **changed in the editor since it
was generated** is left as it is, and its entry in the answer says so (`"kept": true`, with the current `placement`). Delete the building in the app to make it new again.
(This is how `POST /api/v1/buildings` already works: `sourceId` there is the `id` here.)

### OpenStreetMap data

The footprints and tags come from OpenStreetMap, © OpenStreetMap contributors, under the ODbL (https://www.openstreetmap.org/copyright).
Say so where you use them. Do not send people's private details to this API: it needs only the outline and the tags.

## A map program's workflow

1. The user makes a token in the app (**API**) and gives it to your program, together with the app's address.
2. Cut the OSM buildings of the map into batches of at most 20. Convert their coordinates into metres in your map's plane (x east, y north).
3. `POST /api/v1/generate` each batch with the same `folder` (the map's name).
4. For each `ok` building: download `gameMod`, copy its files into your map, and place it at `placement` (see [Placement](#placement)). Keep `buildingId` and `version`.
5. Later: `GET /api/v1/buildings?folder=...` shows which buildings changed (`version` is higher). Download those again.

## Versions and changes

The read endpoints above keep working as they are. New fields may be added to answers, so ignore the ones you do not know. The planned generate endpoint
will be marked as available here (and the status table at the top changed) when it is built.
