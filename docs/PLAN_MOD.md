# Plan: moddar som egen sak (byggnader och rekvisita är fristående)

Skriven 2026-11-24 efter ett samtal med Lars. Ersätter den delen av PLAN_TYPER.md som handlar om att *byta* byggnadens typ: en byggnad har ingen typ längre.
Inget av detta är byggt.

## 1. Modellen

- **Byggnad**: form, insida, material och utseende. Ingen typ.
- **Rekvisita** (modellerarens objekt): fristående. Kan vara ett helt hus som är ritat från grunden utan mallarna.
- **Mod**: en container med *poster*. En post är en byggnad eller en rekvisita, med läge (x, z, vridning) i modens egen plan. Samma byggnad eller rekvisita kan ligga i flera moddar.
- **Modtyp** (fårhage, kohage, butik, silo, ...) sitter på **byggnadsposten**, inte på moden. En mod med flera byggnader kan alltså ha en fårhage och en butik. Typen används bara när moden genereras.
- **Spelobjekt** (sovknapp, djurdialog, trigger, ikon, ...) ligger på posten. De filtreras inte: allt får läggas på allt. Modtypen ger *varningar* ("betesområde saknas") men blockerar aldrig.
- **Staket** är ett eget objekt i moden, inte en del av en byggnad. Punkterna är fria eller förankrade i ett hörn eller en vägg på en post (avstånd längs väggen), så de följer med när posten flyttas eller ändras. Portar enligt PLAN_TYPER (spelets `GATE4m`-sektioner). Djurens ingång är en länk från en byggnadspost (en dörr eller betesöppningen) till ett staket.
- **Live**: en mod följer byggnaden direkt. Hamnar ett spelobjekt fel när byggnaden ändras visas en varning, ingen kopia tas.

## 2. Vad som finns och vad som måste delas

`kind` blandar idag två saker.
- Byggnadens form och innehåll stannar hos byggnaden: walkIn, möbelkatalog, presets, öppna sidor, ventilatorer.
- Spelfunktionen flyttar till modtypen: placeable-typ, objekttyper (`kind.objects`), djur, XML, navmesh, shopkategori, varulistor.

Befintligt som återanvänds: `modDescXmlMulti` (flera byggnader i en mod), betesobjektets förankring vid väggen, planvyn med `snapDecor`/`snapFencePoint`, hjälpfunktionerna för hörn och väggar i `layout.mjs`, och exportfilerna per kind.

## 3. Steg

1. **Objekt som inte hör till en typ** (gjort 2026-11-24 för alla utom djurens). Exporten av dem ligger i `kinds/gameobjects.mjs`, utanför kinderna, och de får läggas på alla byggnader: `sleep`, `workshop`, fordonsbutiken (`counter` + `spawn`), silons `intake`, bensinstationens `pump` och varuhuset (`palletcounter` + `palletspawn` + `unload`). Placeable-typen blir spelets egen (`farmhouse`, `garageWorkshopSolarPanels`, `sellingStation`, `buyingStation`, `warehouse`) när byggnaden bara har en av dem på en vanlig `simplePlaceable`, annars en typ i modens egen modDesc med kindens typ som förälder och de specialiseringar som saknas (fordonsbutiken har ingen egen spelettyp och får alltid en). Kartbutikens `counter` och `spawn` är dess egna (`kind.handles`). Kvar: djurens `food`, `bales`, `loading`, `info`, `pasture`, `feedTrough`, `waterTrough`, som hänger ihop med betet, djuren och staketet (steg 4). Provat i spelet 2026-11-24: hus med både sovknapp och verkstad fungerar (man kan sova och laga traktorn). Inte provat: allt annat, bland annat en djurbyggnad eller bilhandlare med sovknapp, och en butik, en inlastning, en tankstation eller en pallbutik på en byggnad av en annan typ.
2. **Dela `kind`** i byggnadens form och en modtyp (exporten, objekttyperna). Testet `kinds.test.mjs` kontrollerar båda delarna.
3. **Mods som egen tabell** (backend gjort 2026-11-24: tabellerna `mods` och `mod_items`, `/api/mods`; sidan `/mods` och `/mods/[id]` med flikar finns (2026-11-24, inte sedd i webbläsare); planen i 3D (fliken Plan: flytta med dragning, snappa, vrida; inte sedd i webbläsare) finns; kvar: modtypen används av exporten, spelobjekt per post. Beslutat av Lars: namnet är "mod", rekvisita får ligga ensam, `/api/v1` får brytas) (`mods`, poster med läge och modtyp, spelobjekt per post), sidan `/mods` och modens plan med flera saker (flytta, vrida, snappa).
4. **Staketet** som eget objekt med förankrade punkter, portar och djurens ingång.
5. **Migrering**: varje befintligt projekt blir en byggnad plus en mod med sin gamla typ och sina objekt. Guldtesterna (`golden-saves`) ska ge samma bygge före och efter.
6. **API:et** (`/api/v1`, kartappen): `buildings` fortsätter fungera; `mods` läggs till. Beslut behövs om vad kartappen läser (byggnadens egen standardmod, eller en vald mod).

## 4. Sidorna följer DESIGN.md

Ingen ny stil. Allt här är redan beskrivet i [DESIGN.md](DESIGN.md) och återanvänds:

- **Top bar** (4.1): `My mods` blir en knapp bredvid `My buildings`, `My items` och `My textures`. Aktuell sida har `.current`.
- **Listsidan `/mods`** (5): top bar, sidhuvud med en röd primärknapp ("New mod"), tabbar med antal (`Fårhagar 3`, efter modtyp, och mapp som för byggnader), ett rutnät av kort med bild, namn, en dämpad rad och knappar nere till höger. Tom lista: den streckade rutan med en mening och primärknappen.
- **Att skapa en mod** (chooser, 5): ersätter listan medan den är öppen, med en rad sekundärtabbar för modtyp och rutnätet av startpunkter. En val mellan några namngivna alternativ är alltid tabbar, aldrig en rullista.
- **Modeditorn** (5): tre kolumner som byggnadseditorn: vänster panel med flikar och träd (poster, staket, spelobjekt), detaljpanel och förhandsvisning/planvy. Samma dragkanter och lagring av bredder.
- **Dialoger** (4.7): `confirmDialog`, `promptDialog`, `formDialog`; aldrig webbläsarens egna.
- **Knappar och formulär** (4.2, 4.6): en primärknapp per vy, raderande som röd text med uttryckligt bekräftelsesteg, segmenterade val i verktygspaneler, reglage med skrivbart tal.
- **Texter**: engelsk text är nyckeln, `t()` på allt, svenskan i `sv.json`, användarnamn med `translate="no"`.
- **Telefon** (1.7): 16 px marginal, rader som bryts, planvyn staplas under 820 px.
- Både ljust och mörkt läge och 400 px bredd kontrolleras innan en sida är klar.
- Appväxlaren (Maps | Buildings) ändras inte; kartappen får mods i samma stil via DESIGN.md:s checklista (6).

## 5. Öppna frågor

- Vad ska kartappen läsa via API:et (steg 6)?
- Ska en rekvisita kunna ligga i moden utan byggnad (ett staket med skyltar som enda innehåll)? Planen antar ja.
- Namn: "mod" eller "projekt" i gränssnittet? Idag heter spelfilen mod, och My buildings sparar projekt.

## Beslut 2026-11-24 (Lars)

- Hela modden är **en** placeable: alla poster ligger i samma i3d, spelaren sätter ut gården i ett svep. Spelobjekt läggs på en post i modens träd och sparas på posten (`mod_items.objects`), men slås ihop vid generering. Spelet tillåter ett `<farmhouse>`, ett `<workshop>` osv. per placeable, så två sovplatser i en mod ger en varning och bara den första exporteras.
- Modens sida ska vara en fullstor redigeringssida (DESIGN 5): träd till vänster (modden, byggnader och rekvisita, under varje post dess spelobjekt), den stora 3D-vyn i mitten, detaljer för det valda.
