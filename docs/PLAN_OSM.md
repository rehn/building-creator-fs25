# Plan: hus från OSM-data via API (november 2026)

Ett annat program (fs25map-creator) bygger en karta och har OSM-data. Det ska kunna be den här appen göra byggnader av OSM-fotavtryck,
få tillbaka färdiga filer och placeringar, och sätta ut dem på kartan. Husen behöver inte bli perfekta: användaren förfinar de hon vill ha
i editorn efteråt. Överenskommet med användaren. Varje steg ska vara färdigt, testat (TDD) och körbart innan nästa börjar.

## Mål

- `POST /api/v1/generate` med `{folder, buildings: [{id, footprint, tags}]}` skapar byggnader i mappen `folder` (kartnamnet) och ger per byggnad
  id, namn, placering (`x, y, angle, width, depth`) och länkar till filerna.
- Filerna (i3d, texturer, mod-zip) görs **på servern** (web-containern, Node), så kartprogrammet kan hämta dem med token direkt utan att någon öppnar editorn.
- Mappen är en **gruppering i appen**: kolumn `folder` på byggnaden, "Mina byggnader" grupperar på karta, listan kan filtreras (`?folder=`).

## Avgränsning

- Fotavtrycket i meter i kartprogrammets lokala system (x öst, y norr), inte lat/lon: kartprogrammet har redan sin projektion.
- Bara huvudbyggnad + flyglar direkt på huvudbyggnadens väggar (L, T, U). Flyglar på flyglar kommer inte ur OSM-formen i första versionen.
- Sorterna: `house` och `shed` (garage, förråd, lada, maskinhall). Andra sorter (ladugård, hönshus ...) kräver mer än en form och kommer inte ur OSM.
- Inga fönster, dörrar eller rum. Husen får appens standarddörr och standardfönster; det går att lägga till i editorn.
- Taggar som saknas får rimliga standardvärden. Det som gissats står i `notes` i svaret.

## Det som provats

- `sanitize` + `i3dFiles` + `placeableXml` körs i ren Node utan DOM och ger i3d, `.shapes` och XML på ungefär 1 s per hus.
- Texturerna är det enda som binder till webbläsaren: `compose()` i `editor.mjs` lägger pixlar i en canvas. De kan skrivas om till rena RGBA-array för `dds.mjs`.
- Det som inte går att göra på servern: rummen bakom fönstren (`interior.mjs`, canvas) och butiksbilden (WebGL). Genererade hus får `interior: false` och en enkel platsbild.

## Steg

1. **OSM till inställningar** (`frontend/src/editor/osm.mjs`, ren funktion). `osmToHouse({footprint, tags})` ger `{ok, kind, name, settings, placement, notes}`.
   - Riktningen: huvudriktningen på kanterna (viktad med längd, modulo 90 grader) läggs längs byggnadens bredd. Fotavtrycket rastreras (25 cm).
   - Huvuddelen är den största rektangeln i fotavtrycket, och kanterna dras till närmaste hörn (inom 30 cm) så att en rektangel blir exakt.
   - Flyglar: för varje sida av huvuddelen den största rektangeln i remsan utanför (bredd minst 2 m, djup minst 1,5 m, yta minst 8 m2), högst `MAX_WINGS`. Det som blir över lämnas ute och räknas i `notes`.
   - Taggarna: `building` (sort), `building:levels`/`height` (våningar), `roof:levels` (inredd vind), `roof:shape`, `roof:angle`/`roof:height` (lutning), färger, `roof:material`, `building:material`.
   - Test: rektangel, roterad rektangel, L, T, U, för små former, oriktade former, taggar. Bygget kontrolleras genom att `wingsOf` ger delar som täcker fotavtrycket.
2. **Filer utan webbläsare.** Texturerna i `editor.mjs` skrivs om till rena pixlar (en funktion i en ren modul som både editorn och servern använder). `makeFiles(settings, name)` ger mod-zip och modellfiler (obj, mtl) och en platsbild. Jämförs mot editorns filer i ett test.
3. **Backend.** Kolumn `folder` på `projects` (SQLite och Postgres, migrering vid start), listan filtrerar på den och "Mina byggnader" grupperar på den. Token-läge `write`
   (skapa byggnader och skicka modeller, inte radera). Skrivrutter under `/api/v1` (skapa byggnad med mapp, skicka modell).
   **Klart (backend):** `folder`, `source_id` och `generated_version` på `projects`, `can_write` på `api_tokens`; `POST /api/v1/buildings` (skapa eller göra om, 201/200 med `status` created, updated eller kept),
   `PUT /api/v1/buildings/{id}/model`, `GET /api/v1/folders`, `?folder=`; kryssrutan "May create buildings" på API-sidan; tester på SQLite (Postgres körs i CI). Kvar av steg 3 som planen räknade: att "Mina byggnader"
   grupperar på mapp och kan flytta byggnader, vilket hör till steg 5 (appens gränssnitt). "Ändrat i editorn" = versionen är högre än den version generate-rutten senast skrev (`generated_version`).
4. **Generate-rutten** i web-containern (`/api/v1/generate`): kontrollerar token mot Go-API:t, kör steg 1 och 2 och sparar via Go-API:t.
   Samma `id` i samma mapp uppdaterar och skapar inga dubbletter, men rör inte ett hus som ändrats i editorn. Högst ett fast antal hus per anrop (ungefär 20).
5. **Editorn** visar mapparna ("Mina byggnader") och kan flytta en byggnad till en annan mapp.

## Öppna frågor

- ~~Hur känner regenereringen igen "ändrat i editorn"?~~ Avgjort: versionen är högre än `generated_version` (se steg 3).
- Vilken `angle`-konvention vill kartprogrammet ha? Förslag: grader moturs från öst, för byggnadens x-axel (bredden), med y norr.
- Ska en mapp kunna laddas ner som en enda mod (flera byggnader)? Det finns redan (`modDescXmlMulti`), men inte per mapp.

## Status

- Steg 1: påbörjat.
