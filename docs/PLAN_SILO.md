# Plan: spannmålssilo som köper spannmål (november 2026)

Första av Lars särskilda byggnader (sedan bensinmack, djurhandlare). Beslutat med Lars: **börja med en spannmålssilo som köper spannmål, man ska kunna välja vad den köper; den ska inte vara köpbar** (kartan placerar den, den syns inte i butiken och kan inte säljas).

## Ansats

En ny sort (kind) `grainsilo`, som `dealership`/`defaultdealer`: gemensamt skal, spelfunktionen som spelobjekt, exporten väljer FS25-typ. Ingen generell "specialbyggnad".

- **Skalet:** en intagshall (som `shed`: öppna sidor och skjutport går redan) och 1-4 runda silor bredvid. Silorna ritas av sorten själv (cylinder + koniskt tak, ställning, stege; kollision = cylinder), som kor och får ritar sina krubbor utomhus. Rundformen läggs i den gemensamma modellen först om en sort till behöver den (tank vid bensinmacken).
- **Spelobjekt:** `tip` (lådan där fordon tömmer; blir stationens unload trigger) och ikonen/kartpunkten. Nya typer läggs i `objects.mjs` OBJECT_TYPES.
- **Vad den köper:** inställning (kryssrutor i Game-fliken, som dealerns grupper): vete, korn, havre, raps, majs, sojabönor, solros ...; inget valt = vete. Priset som procent av spelets pris (`sellPrice`-mönstret).
- **Inte köpbar:** `placeable(p).sellable = false` (canBeSold/showInStore false i XML:en), som `defaultdealer` med `shopBuyable` av. Kartprogrammet lägger in den som en placeable med store item.
- **Export:** en `sellingStation`-placeable (typ och XML efter en av spelets egna, se nedan); behövs en egen typ går den via `kind.modTypes`.

## Det som saknas innan exporten kan skrivas

Spelfilerna går inte att nå från utvecklingsmiljön. Vi behöver en av spelets egna placeables med `<sellingStation>` (och gärna en med `<silo>`/tömningsplats om det finns): hur unload trigger, fillTypes, pris och kartikon skrivs, och vilken placeable-typ och vilka specialiseringar den har. Samma arbetssätt som hönshuset (`chickenBarnBig`).

## Status (2026-11-21)

Steg 1-3 klara i koden (kinds/grainsilo.mjs, test/grain-silo.test.mjs, golden saves uppdaterade). Spelets egen XML/i3d (grainRiverSilo01Triggers) har lästs; kvar: kontrollera `fillTypes` mot placeable.xsd, aiSpline, pall-/baltriggers, steg 4 (prova i spelet).

## Steg (TDD, ett i taget)

1. Sorten `grainsilo` med hall + silor (preset, objekt, tester som `shed.test.mjs`); silorna i förhandsvisningen och i i3d (visuals + kollision).
2. Spelobjekten (`tip`, ikon) och inställningarna för vad den köper.
3. Exporten: sellingStation-XML efter spelets exempel, `sellable: false`; tester på XML:en.
4. Prova i spelet (via kartprogrammet): tömning, pris, kartikon, att den inte finns i butiken.

## Öppet

- Exakt placeable-typ och specialiseringar (kräver spelets exempel).
- Om stationen ska ha lager (silo man även kan lasta ur) eller bara köpa. Nu: bara köpa.
