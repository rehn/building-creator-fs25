# API for other programs

House to i3d has an HTTP API for programs that want to use its buildings, for example a map builder that places them on a map.
This page says what exists today, and (clearly marked) what is planned for making buildings from OpenStreetMap footprints.

| Part | Status |
|---|---|
| [Reading buildings and their files](#reading-buildings-v1) (`GET /api/v1/...`) | Works today |
| [Reading mods](#reading-mods-v1) (`GET /api/v1/mods`) | Works today (read only; the game zip of a whole mod is not stored on the server, see below) |
| [What a token may do](#get-apiv1me) (`GET /api/v1/me`) | Works today |
| [Folders](#folders) (`?folder=`, `GET /api/v1/folders`) | Works today |
| [Creating buildings and sending their files](#writing-buildings-v1-write-tokens) (`POST /api/v1/buildings`, `PUT .../model`, tokens that may write) | Works today (not yet tried against a real map program) |
| [Generating buildings from OSM footprints](#generating-buildings-from-osm-planned) (`POST /api/v1/generate`) | **Available**, in both modes (`"placeable"` by default, `"scenery"`); see `docs/PLAN_OSM.md` |

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

### Reading mods (v1)

A mod holds buildings and props placed in a plan, plus the game objects, the hen yard and the fence that were added on its page (docs/PLAN_MOD.md).

- `GET /api/v1/mods` gives `{"mods": [...]}` with `id`, `name`, `version`, `itemCount`, `updatedAt` (no items, no plan).
- `GET /api/v1/mods/{id}` also gives `items` (each post: `id`, `kind` "building" or "prop", `ref` the id of the building or prop, `type`, `x`, `z`, `rot` in degrees, `y`, `name`, `missing`, and for a building `building`: the path to fetch it) and `data`, the mod's own plan as the editor saves it (`objects`, `hens`, `inside`). Treat `data` as the editor's: it may get new fields.
- 404 `not_found` when the mod is not yours. Writing mods and the game zip of a whole mod are not here yet: the zip is made in the browser from the plan, so a program that wants one fetches the buildings (`mod.zip`) it needs.
- `GET /api/v1/buildings` keeps working as it was.

### Files

All files carry `ETag: "v<version>"`. Send it back as `If-None-Match` to get `304` when nothing has changed.

| Path | What |
|---|---|
| `/api/v1/buildings/{id}/icon` | The picture of the building |
| `/api/v1/buildings/{id}/model.obj` | The model to draw: metres, y up, one group per material |
| `/api/v1/buildings/{id}/model.mtl` | The colours the `.obj` refers to (no textures: `map_Kd` is not written) |
| `/api/v1/buildings/{id}/game-mod.zip` (**to go**: from 2026-11-25 a building has no game logic and only a mod is exported, docs/PLAN_MALLAR.md step 3; the files below are what the app still sends with the building until the server keeps the mod's zip instead) | **The game mod**: `modDesc.xml`, `house.xml` (the placeable and its shop data), `house.i3d` (+ `house.i3d.shapes`), textures, imported items, shop picture. What a map builder unpacks into a map |
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

**`POST /api/v1/folders/rename`** (a token that may write) renames a folder: `{ "from": "Hallsberg", "to": "Hallsberg 2026" }` gives `{ "name": "Hallsberg 2026", "count": 2 }`.
Every building in it moves, and nothing else changes (not the version, so a building a person has not touched is still regenerated, and one they have is still left alone;
regenerate with the new `folder`). `404 not_found` if `from` has no buildings; `409 folder_exists` if `to` already has some (folders are not merged, since two maps may use the same
`id`); `400 invalid_folder` for an empty name, a name over 80 characters or `from` equal to `to`.

A person moves a building between folders in the app (the list under **My buildings** is grouped by folder, with a folder menu on each building; behind it `folder` in `PATCH /api/projects/{id}`, `""` takes it out). Moving is not editing: the version stays, so a generated building is still regenerated (under its new folder name, so send that as `folder`) and its files stay. A move into a folder that already has a building with the same `sourceId` is refused (`409 folder_clash`). Folder names are 1 to 80 characters without control characters.

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

## Generating buildings from OSM

> **Available** in both modes. Buildings are made one after the other in one request (no job queue yet). The contract below is what it does (`docs/PLAN_OSM.md`, step 4). Its parts exist: the conversion from a footprint
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
| `mode` (on the request) | `"placeable"` (default): the game mod, for a building that is bought and sold. `"scenery"`: the [scenery files](#scenery-mode). Optionally `"textureSize"` (256, 512 or 1024) for scenery |

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
| `footprint` | The whole building (main part **and wings**) as rectangles: `{ "angle": 0, "parts": [{ "part": "main", "x": 1210.5, "y": 880.7, "width": 12, "depth": 7 }, { "part": "wing", ... }] }`. Each rectangle's middle `x, y` is in the map's plane (metres, x east, y north); every rectangle is turned by the same `angle` (degrees counter-clockwise from east) with `width` along the building's x axis. The first is the main part, equal to `placement`. Use it to clear trees, level the ground or check overlaps |
| `notes` | What was guessed, fitted or left out. Show them to the user or log them |
| `ok: false` | `error` says why and `code` is one of `invalid_footprint` (fewer than three points or no numbers), `too_small` (under 6 m2, or a main part under 2.5 m on a side), `too_large` (main part over 60 x 50 m; the long side counts as the width), `degenerate` (no shape found), `invalid_building` (missing or repeated id), `files_failed` (or the API's own code); the building was not made |
| `kept: true` | A person changed it in the app, so it was left alone and no files were made. `placement` is then computed from the footprint you sent, not from the building as it is now |

A request that is wrong as a whole (not JSON, no `folder`, more than 20 buildings, a bad token) gets a 4xx error as in [Basics](#basics).

#### Background jobs (`"async": true`)

For a big batch, or a client that cannot wait a minute for an answer, add `"async": true` to the request. The server checks the request and answers `202` at once:

```json
{ "jobId": "9f1c...", "status": "queued", "total": 20, "done": 0, "statusUrl": "/api/v1/generate/9f1c..." }
```

Then poll `GET /api/v1/generate/{jobId}` (the same token; every few seconds is fine):

| `status` | Meaning |
|---|---|
| `queued`, `running` | `done` of `total` buildings are finished |
| `done` | `result` is the answer a plain request would have given (`folder`, `buildings`, and `blobs` for scenery) |
| `failed` | `error: {code, message}` and `httpStatus`, e.g. a token that may not create buildings (`forbidden`) |

- A request that is wrong as a whole still gets its 4xx at once, not a job. The token is checked when the job starts, so a bad one shows as `failed`.
- One job runs at a time; up to 4 wait or run per server (`GENERATE_MAX_JOBS`), then `429 busy`: try again later.
- A job and its answer are kept in the server's memory for 10 minutes after it finishes (`GENERATE_JOB_TTL_MINUTES`) and are lost if the server restarts: fetch `result` once and keep it. A job that is gone, or belongs to another token, gives `404 not_found`; send the batch again (the buildings are only updated, see [Regenerating](#regenerating)).

### Scenery mode

A building a map uses as plain scenery (a `ReferenceNode` to `house.i3d` in the map's own i3d, not a placeable and not in the shop) does not want the game mod. With `"mode": "scenery"`
the files are:

- `house.i3d` and `house.i3d.shapes` (copy both, side by side, the same relative names) and `textures/*.dds`. **No** `modDesc.xml`, `house.xml` or pictures.
- The i3d is the outside shell: walls, trim, roof, glass, foundation, chimney, gutters and ironwork, with the doors drawn shut. The root node is `house` at `0 0 0` (the middle of the main part, the ground at y = 0, front wall towards +z).
- **A solid collision**: a box for the main part and one for each wing, as high as the walls (the roof has none). No doorways to walk into.
- **None of what the placeable XML uses**: no `clearAreas`, `levelAreas`, `testAreas`, `tipOcclusionUpdateAreas`, `indoorAreas`, no door triggers or animated doors, no kind-specific nodes (workshop, shop, navigation, pasture), no inside (furniture, curtains, rooms) and no user attributes.
- The glass is opaque (there is nothing behind it).
- Textures are 512 px by default (the outside's surfaces only: about 12 files, 2 MB for a house; `"textureSize": 256` or `1024` also work). Everything the i3d refers to is a relative `textures/...` path.

**In the generate answer** (`"mode": "scenery"`): the building is made in the app (settings only, `hasModel` stays `false`) and the files come back in the answer, not as downloads:

- each building has `files: [{ "path": "house.i3d", "sha256": "...", "size": 123456 }, ...]`: `house.i3d`, `house.i3d.shapes` and `textures/<name>_<8 hex>.dds`.
  **Texture names carry a hash of their bytes** (and the i3d says so), so a map can merge the textures of many buildings into one folder without a clash: the same name is the same file.
- the top level has `blobs: { "<sha256>": "<base64>" }`: every different file once, however many buildings use it (most houses share most textures). Look each file up by its `sha256`.
- `house.i3d` and `house.i3d.shapes` are the same name in every building: keep them apart per building (a folder per `buildingId`, say).
- `"textureSize"`: 256, 512 (default) or 1024.

The answer is large (a few MB per building before sharing), so ask for a few buildings at a time.

### Placement

`placement` is for the **middle of the main part** of the building, in the same plane as the footprint you sent:

- `x`, `y`: metres, x east, y north.
- `angle`: degrees **counter-clockwise from east** (as seen from above, north up) of the building's **width axis**, its x axis.
- `width`, `depth`: the main part's size in metres. Wings stand outside this rectangle.

In the building's own coordinates the front wall is at `+z` (z points towards the viewer when looking at the plan from above, so **north is -z**).
Turning that into the game's coordinates is the map program's job: a map whose world x is east and world z is south uses `worldX = x`, `worldZ = -y`,
and rotates the building about the vertical axis by `angle`. The sign of the rotation in the game's i3d convention is **not yet checked in the game**; try one L-shaped building and flip it if it comes out mirrored.

### Reference building

`GET /api/v1/reference-building` (any token; `?textureSize=256|512|1024`, 512 by default) answers with two copies of one L-shaped house as [scenery files](#scenery-mode), to check that your
map program places and turns buildings the right way **before** it places hundreds. Seen from the front (outside, from the south) the house is:

- the main part 12 x 8 m, with a 5 x 6 m wing at the **back** (north), flush with the **east** end: a mirrored building has its wing at the west end;
- the **front wall red** (`#c0392b`), everything else white walls and a grey roof.

```json
{ "description": "...", "buildings": [
    { "id": "reference/L-0",  "name": "Reference L 0",  "request": { "id": "...", "footprint": [[100,200], ...], "tags": {...} },
      "placement": { "x": 106, "y": 204, "angle": 0, "width": 12, "depth": 8 },
      "footprint": { "angle": 0, "parts": [ { "part": "main", ... }, { "part": "wing", "x": 109.5, "y": 211, "width": 5, "depth": 6 } ] },
      "frontWall": { "from": [100, 200], "to": [112, 200], "faces": "south" },
      "files": [ { "path": "house.i3d", "sha256": "...", "size": 123 }, ... ] },
    { "id": "reference/L-30", ... "placement": { ..., "angle": 30 ... }, "frontWall": { ..., "faces": "south turned 30 degrees counter-clockwise" } } ],
  "blobs": { "<sha256>": "<base64>" } }
```

- `request` is what you would send to `POST /api/v1/generate` for it (its `placement` and `footprint` in the answer are the ones given here: send it and compare).
  `frontWall` is the red wall's two corners in the map's plane (metres, x east, y north), `from` its left end seen from outside.
- Put both in a test map at `placement`. Passing means: the red wall faces south on the first and is turned 30 degrees counter-clockwise (as seen from above, north up) on the second,
  and the wing is at the back and to the east in both. If the second one comes out turned 30 degrees the other way, flip the sign of the rotation in your i3d convention.
- Same file format and `blobs` as the scenery answer. The first call makes the files (about 10 s), later calls with the same `textureSize` are answered from memory.
- Not tried in the game: that is what it is for.

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
A wing on a wing, windows, doors and rooms are not made from OSM data. What the tags leave open (colours of walls, trim, roof, door and foundation, wall and roof material, roof pitch, chimney, window style, size and number per wall, door style, size, wall and place, porch) is picked from the building's `id`, so the same building looks the same each time it is generated and different buildings differ; the tags always win (`building:colour`, `roof:colour`, `roof:material`, `building:material`, `roof:angle`). `notes` says so.

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

## The game mod of a whole mod (2026-11-25)

A mod is exported as **one** placeable (docs/PLAN_MALLAR.md). The editor makes the zip in the browser when the user presses *Generate game mod* on the mod's page and sends it to the server with the version of the mod it was made from (`PUT /api/mods/{id}/package?version=N`, the zip as the body, up to 64 MB; it must have `modDesc.xml` at its root; `409 version_conflict` if the mod has been saved again). A program with a token fetches it:

| | |
|---|---|
| `GET /api/v1/mods/{id}` and the list | have `package`: `{ "version": N, "upToDate": true/false, "zip": "/api/v1/mods/{id}/mod.zip" }` when a zip has been made (left out when none). `upToDate` is false when the mod has been saved after the zip was made (a change in a building or prop inside it is not seen by this: press Generate game mod again) |
| `GET /api/v1/mods/{id}/mod.zip` | The game mod, `FS25_<Name>.zip`, with an `ETag` (send `If-None-Match` to get `304`). 404 until one has been made |

Not tried in the game or with the map app.
