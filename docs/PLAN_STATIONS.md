# Plan: säljstationer, fabriker och andra specialbyggnader (november 2026)

Utkast att besluta om, inget är byggt. Frågan från Lars: ska alla specialbyggnader (säljstationer för olika varor, fabriker m.m.) ha var sin grupp, eller ligga i samma grupp med olika attribut?

## Beslut att ta

**En kind per spelfunktion** (FS25:s placeable-typ och dess XML), och **varianter som presets och attribut inom den kinden**. UI:t grupperar efter kategori (`CATEGORIES` i kinds/index.mjs), inte efter kind.

Skäl:
- Varje spelfunktion har egen export: andra specialiseringar, noder, trigger och spelobjekt. En enda kind med villkorliga attribut gör schemat, `sanitize`, sökrutan och testerna svåra att hålla ordning på.
- En kind per vara (spannmål, mjölk, trä, skrot) blir kopierad kod: det är samma spelfunktion med andra fill types, pris och utseende.
- Så är det redan gjort för djuren: `cow.mjs` tar en config (COW / SHEEP) och hönshuset delar `pasture.mjs`; det som delas är hjälpkod, det som skiljer är kinds.

**Testet för en ny byggnad:** får den en egen `<placeable type=...>` eller egna specialiseringar i spelet? Ja: ny kind. Nej, den köper eller säljer bara andra varor: preset eller attribut.

## Kinds och vad som varierar

| Kind | FS25-typ | Varianter (presets/attribut) | Finns |
|---|---|---|---|
| `sellingstation` | `sellingStation` | vad den köper (fill types, grupper: spannmål, mjölk, trä, ...), priset (`sellPrice`), utseende: silo, hall, lastramp, brygga | grainsilo är första fallet |
| `productionpoint` | `productionPoint` | recept (in-/utvaror, cykler), lager, utseende | nej |
| `dealership`, `defaultdealer` | `vehicleBuyingStation` / kartnoder | vilka fordonsgrupper | ja |
| `shed` (verkstad som spelobjekt) | `garageWorkshop...` | | ja |

Kategorin `stations` ("Stations and depots") rymmer säljstationer och fabriker; "Shops" och "Workshops" är som i dag.

## Steg

1. **Gör grainsilo till preset av en `sellingstation`** (inget beteende ändras): kindens inställningar blir `buy*` (en lista av grupper), `sellPrice`, `look` (silo | hall | ...). Gamla saves har `kind: "grainsilo"` och migreras i `sanitize`; golden-saves ska fortsätta bygga likadant. Görs först när en andra säljstation behövs, inte i förväg.
2. **Fler säljstationer som presets:** mjölktank/mejeri, sågverk (trä), skrot, allmän mottagning. Utseendet är `look`; varje nytt utseende ritas i `kind.outside` som silon.
3. **`productionpoint` som egen kind** (se nedan), först en minimal: ett recept, en in-trigger, en ut-trigger.
4. Prova i spelet efter varje steg (se Öppet).

## Fabriker (productionPoint)

Är mycket mer än en säljstation: flera ingångar och utgångar, recept med mängd och cykeltid, lager, ibland fysiska pall- eller baltriggers. Därför egen kind från början.

Utkast: spelobjekt `input` (tömningsplats, en per ingångsvara eller en gemensam), `output` (pallplats / lastning), `intake`-liknande trigger. Recepten är en lista i inställningarna `[{in: [{fill, liters}], out: [{fill, liters}], cyclesPerHour}]` med ett urval färdiga recept som presets (bageri, sågverk, sockerfabrik ...). Skalet är en hall (shed) eller en egen byggnad med `outside`-delar.

## Det som blir fel om vi inte väljer

- Alla stationer i en kind: en lång rad "visa bara om ..." i `sections`.
- För många kinds: varje ny vara kräver ny modul, test, golden save och i18n.

## Öppet (kräver spelets filer, som inte finns i utvecklingsmiljön)

- Spelets egna `productionPoint`-placeables: XML, specialiseringar, vilka fill types och hur pallar/in-/utlastning skrivs (som hönshuset lästes mot `chickenBarnBig` och silon mot `grainRiverSilo01Triggers`). Behöver läsas före steg 3.
- Om fabrikens recept ska gå att välja fritt eller bara bland spelets.
- Om stationen ska ha lager (köpa och även lasta ut), nu bara köpa (som PLAN_SILO).
- Silon är fortfarande aldrig prövad i spelet; steg 1-2 bygger på att den fungerar.

## Beslut (Lars, 2026-11-22)

1. **Silon är klar** (men inte prövad i spelet). Nästa specialbyggnad är **bensinmacken**: Lars bifogar en bild som förebild (inte med när detta skrevs, så utseendet är ej bestämt). PLAN_SILO nämner en rund tank vid bensinmacken som skäl att senare lägga rundformen i den gemensamma modellen.
2. **Fabriker väntar** tills säljstationerna är prövade i spelet. `productionpoint` är kvar som riktning, inget byggs nu.
3. **Att köpa och producera i samma byggnad ska vara valbart.** Därför ska funktionerna vara delar man slår på i en byggnad, inte något som en kind är: en station har `buys` (vad den köper; tom = köper inget) och senare `produces`. Ingen kind blir "både och"; en byggnad får funktionerna den har slagit på, och exporten sätter ihop XML:en för dem (en placeable kan ha flera specialiseringar). Detaljerna tas när fabriken kommer; fram till dess hålls `buys` skilt från stationens utseende så att det går att lägga till en funktion utan att skriva om silon.

## Nästa steg: bensinmacken

Först ta reda på vad en bensinmack är i FS25 (säljer bränsle till fordon vid en pump? egen placeable-typ? finns en i basspelet att läsa, som `grainRiverSilo01Triggers` för silon?). Det avgör om den är en egen kind (egen typ/specialisering, som troligt) eller ett preset av `sellingstation`. Sedan samma arbetssätt som silon: spelets egen XML först, sedan en kind med hall/tak/pumpar/tank som `kind.outside`, test först, och prova i spelet.

Öppet för den: bilden (utseende), om pumpen ska vara ett spelobjekt, pris per liter, och om den ska gå att köpa i butiken eller placeras av en karta (som silon).
