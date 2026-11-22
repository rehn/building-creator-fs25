# Plan: en modellerare för FS25 (november 2026)

Utkast att besluta om, inget är byggt. Bakgrund: bensinmacken (PLAN_STATIONS.md, #47) blev ett skjul utan väggar med pumpar som är för enkla. Appens kärna (rektangulära delar med väggar, tak och öppningar) passar hus, ladugårdar och skjul, men inte specialbyggnader, och de inbyggda modellernas detaljrikedom kommer från texturer, inte geometri. Lars slipper helst Blender (för rörigt) och vill ha ett verktyg som är gjort för att modellera till FS25.

## Mål

- **Den här appen** (house to i3d) håller sig till hus, ladugårdar och skjul och OSM-flödet. Inga nya specialbyggnader byggs i den. Silon och bensinmacken får ligga kvar som de är.
- **Modelleraren** är ett verktyg där man bygger detaljerade specialbyggnader och rekvisita (pump, skylt, tank, fabrik) utan Blender, och får en färdig FS25-mod. Den är **en annan vy i samma app** (beslut Lars, 2026-11-22), inte en separat app.

## Vad som gör Blender rörigt för FS25

Inte modelleringen, utan allt runt den som Blender inte vet något om: UV-uppackning och texturer för spelets shader, kollisionsformer, LOD, nodnamn och mappings, export till i3d och XML med rätt triggers. Det är det modelleraren tar över automatiskt.

## Vad den ska göra

- **Byggstenar, inte hörn:** låda, cylinder, kon, rör, utpressad profil (tak, lister), plan med hål. Som SketchUp, inte en polygonredigerare.
- **Mått i meter** med snappning mot andra delar och rutnät.
- **Material per del:** färg eller textur. Texturer görs från foton (se nedan). UV sätts automatiskt efter verklig storlek, så att plåtens vågor får rätt storlek.
- **Dekaler:** bilder på ytor (skyltar, pumppaneler, etiketter). Mycket av de inbyggda modellernas detaljrikedom ligger i sådant.
- **Funktion:** en del markeras som trigger, hotspot, spawn m.m. och XML:en skrivs (som `kinds/` gör i dag).
- **Automatik:** kollision, LOD, i3dMappings, DDS-texturer, modDesc och zip.

## Vad den inte ska göra

Organiska eller mycket detaljerade former (slangar, bilar, träd). De får tas in från ett annat verktyg (import av obj/i3d, som "Mina objekt" gör i dag). Annars växer verktyget tills det blir Blender.

Förväntan: tydligt bättre än dagens lådpumpar, inte omöjligt att skilja från Giants egna modeller (de har inbakad skuggning och handmålad textur).

## Texturer från foton

Ett eget spår som modelleraren behöver, men som går att bygga och använda först (även i den här appen):

- Användaren laddar upp en bild (t.ex. en rostig korrugerad plåt), väljer beskärning, verklig storlek i meter och (frivilligt) sömlöst läge. Texturer gjorda för att upprepas (som från texturelabs.org) behöver inte göras sömlösa.
- Normal- och specularkarta räknas ut ur ljusstyrkan (en uppskattning; bra på korrugerad plåt).
- Bilden skalas till en tvåpotens (t.ex. 1024) och exporteras som DDS med mips med den kod som finns (`dds.mjs`, `textures.mjs`).
- Bearbetningen görs i webbläsaren vid uppladdning; det som sparas är den färdiga rutan, så att serverexporten (`generate`) kan använda den utan att avkoda foton.
- **Privata per användare**, aldrig delade av admin. Appen påminner vid uppladdning och vid export av en mod att man själv ansvarar för att man får dela texturen.
- **Licens:** texturelabs.org (läst via en hjälpagent, ingen juridisk bedömning) tillåter fri användning men förbjuder vidaredistribution, även gratis och sannolikt även bearbetat. En delad mod som innehåller texturen är därför troligen inte tillåten. Inga sådana texturer läggs i repot. För texturer man vill dela: egna foton eller källor med friare licens (ambientCG och Poly Haven är så vitt vi vet CC0, ej kontrollerat).

## Första steget

Visa att idén håller med **en** sak: en bensinpump byggd av byggstenar med fototexturer och dekaler, exporterad och prövad i spelet. Det tvingar fram de svåra frågorna (UV, material, export) tidigt.

Görs som en **annan vy i samma app**: samma konto (SSO med kartappen), samma projektlista, samma export, samma driftsättning och CI. Det som delas är exportkoden direkt (i3d-skrivaren, shapes.mjs, dds.mjs, textures.mjs, XML-bygget, importen av egna objekt, tokens); inget kopieras och ingen gemensam kodmodul behövs.

Gränser, så att de två inte flyter ihop:
- **Egen modul och egen sida** (t.ex. `src/builder/` och en sida för den). Modelleraren byggs inte in i `editor.mjs`, som är byggd kring en byggnad med inställningar, och importerar den inte. Den får importera exportkoden.
- **Egen datamodell:** ett träd av delar med eget schema, egen sanering och egna tester (som golden saves), inte inställningar som en byggnad. Projektlistan får en egen typ och kategori för den, så mappar och hopfällbara grupper fungerar som de är.
- **Navigering:** ett val i headern (t.ex. Buildings | Props), som växlaren mot kartappen.
- **Laddas bara på sin egen sida**, så att de vanliga sidorna inte blir tyngre.
- Om den senare behöver egen drift är den redan skild från resten och går att lyfta ut.

Ordning: (1) texturfunktionen som ren funktion med tester på syntetiska bilder, (2) sidan "Mina texturer", (3) byggstenar och material per del för pumpen, (4) dekaler, (5) funktionsmarkering och export, (6) pröva i spelet.

## Risker

- Ett stort åtagande, mätt i veckor till månader.
- Appen växer: modelleraren ska hållas i en egen modul, annars blir kopplingen till `editor.mjs` ett problem. Delad drift betyder också att ett fel i den ena kan påverka den andra.
- Bensinmackens trigger, silon och kartflödet är fortfarande inte prövade i spelet. Det bör göras innan mer byggs på samma grund.

## Öppet

- Hur nära de inbyggda modellerna det måste bli (avgör hur mycket dekaler och normalkartor som krävs).
- Hur mycket som ska kunna importeras från andra verktyg jämfört med byggas av byggstenar.
- Om modelleraren ska ha samma konton och API-tokens (SSO med kartappen finns).
- Om pumpen räcker som första test eller om en hel byggnad (bensinmacken) bör vara det.
