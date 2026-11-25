# Plan: byggnadstyper blir mallar, spellogiken bor i modden (november 2026)

Beslutat med Lars 2026-11-25: all spellogik (placeable-typ, djur, butik, sovplats, verkstad, staket, navmesh ...) ska bo i **modden**, utom dörrar som ska kunna öppnas (de hör till byggnaden). En byggnadstyp är då en **mall**: ett förval av utseende och startvärden, inte något som styr spelet. **Bara mods exporteras** (en enskild byggnad får ingen egen placeable eller game-mod.zip). Byggnader som finns är testbyggnader och tas bort, så ingen migrering behövs.

## 1. Vad en typ styr idag

| Spellogik (flyttar till modden) | Utseende (stannar i byggnaden) |
|---|---|
| `placeable`, `modTypes`, `description` | `defaults`, `sections`, `hides` (vilka redigerarsektioner) |
| `objects` (spelobjekt, `required`, `defaults`), `handles`, `lists` | `furnish`, `outside` (möbler och det som ritas utanpå), `catalog` (inredningsdelarna) |
| `scene`, `yard`, `glyph` (navmesh, betesytor, djur, utlastning) | `insideWalls`, `ceiling`, `entrance` (bara bondhuset skiljer sig) |
| Inställningar: `hens`, `cows`, `sheep`, `pastureWall`, `fenceDepth`, `pastureGround`, `animalsInside`, `shopBuyable`, `sell*`, `pumpCount` ... | `presets`, `category` |

`walkIn` är sant för alla nio typer och skiljer ingenting. Utan spellogik skiljer sig typerna bara på inredning, väggfinish och startvärden.

## 2. Det som hänger ihop (varför det inte bara är att ta bort)

- Modens spelobjekt och standardplacering använder typernas kod: `lib/modObjects.mjs` (`henDefaults`, `barnDefaults`) räknar ut var matplatta, utlastning, kar och staket ska stå med en **tillfällig byggnad av typen `chicken`/`cow`/`sheep`** (`sanitize({kind: ...}).objects`), och modens scen (`modframe.mjs`) bygger på `henScene`, `cowScene`, `cowYard`/`yardFrame` i `kinds/chicken.mjs`, `kinds/cow.mjs`, `kinds/pasture.mjs`. Den koden måste flyttas till modens egna moduler *innan* typerna kan tappa den.
- Byggnadens egen export (`makeFiles`, `placeableXml`, `modDescXml`, bundle, "Export" i redigeraren, `generate`-API:t i placeable-läge, `mod.zip`/`game-mod.zip` i `/api/v1`) bygger på typens placeable. Den tas bort (kartappen läser mods; då behövs zip-lagringen på servern, se PLAN_MOD steg 6).
- 89 av 144 testfiler rör typer, spelobjekt eller export. De som provar byggnadens egen spellogik tas bort eller skrivs om som mod-tester; guldsparningarna (`golden-saves.json`) gäller bara utseende och ska ge samma bygge före och efter.

## 3. Steg (en PR var, testerna gröna efter varje)

1. **Modens gård utan typerna** (gjort 2026-11-25, `editor/mod/yard.mjs`; exporten byte för byte densamma, `test/mod-no-kinds.test.mjs` håller modkoden fri från typerna). Flytta ut `yardFrame`, `cowObjects`/`defaultsOf`, `troughFrom`, `henYard`, `pasture.mjs`-hjälparna och scenerna (`henScene`, `cowScene`) till moduler som hör till modden (`kinds/modyard*.mjs` eller `src/mod/`), och räkna ut standardplaceringen utan en tillfällig byggnad av djurtyp (ur byggnadens mått). Ingen ändring i vad som exporteras: `mod-hens`, `mod-cows`, `mod-troughs` och `mod-meadow` ska ge samma filer.
2. **Byggnaden utan spelobjekt.** Ta bort spelobjekten ur byggnaden: fliken Game i redigeraren, trädet "Game objects", `p.objects` och inställningarna för djur och butik i `sanitize`, spelobjektens kod i `editor.mjs` och `objects.mjs` (modsidan behåller `OBJECT_TYPES` och lådorna). Dörrar som öppnas stannar.
3. **Bara mods exporteras.** Ta bort byggnadens egen export (knappar, `makeFiles`, `placeableXml` för en byggnad, bundle, `/api/v1/.../mod.zip` och `game-mod.zip`, `generate` i placeable-läge) och, om kartappen ska ha zippen, lagra modens zip på servern (en ny tabell, kräver Lars godkännande).
4. **En byggnadsmall.** Slå ihop typerna till en byggnad med en inställning för inredning (hus, ladugård, hall) och gör dagens typer till förval i Ny-listan (Hus, Hönshus, Ladugård, Fårhus, Skjul, Hall ...). `kinds/` blir en lista med mallar; `kindOf` och `KINDS` försvinner eller blir en tunn lista.
5. **API och dokumentation.** `docs/API.md`, `ARCHITECTURE.md`, `PLAN_MOD.md`, `CLAUDE.md` (kartan över koden), i18n.

## 4. Risker och frågor

- Steg 1 är det stora: koden för djurgården är ~1500 rader och delas av tre sorters djur. Den provas bara i spelet för hönsen; kor och får är inte provade, så ett fel där syns först senare.
- Steg 3 bryter kartappens flöde (OSM-generering till game-mod.zip) tills den läser mods. Lars har sagt att `/api/v1` får brytas.
- Frågan om var kartappen får moddens zip (alternativ B i samtalet 2026-11-25) avgörs när Lars provar med kartappen.
