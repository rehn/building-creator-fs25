# Plan: typ av byggnad, staket med grindar och dekorationer (november 2026)

Samtal med Lars 2026-11-23. Inget av det som står under "Att bygga" är byggt. Det här är vad vi kom överens om och vad som är öppet, så att vi kan ta upp tråden igen.

## Vad vi höll på med (läget)

Bekräftat i spelet och i redigeraren:
- Modelleraren (föremål): atlas, glans och metall, kollision, logga med "Fit to face" och marginal, spelbar mod med ren logg, binära shapes.
- Sparade objekt: "Save as item" ersätter samma objekt (`PUT /api/assets/{id}`, projektet kommer ihåg `item.id`), objekt fungerar inuti en byggnad, och ritas med textur i husredigerarens 3D-vy (meta.texture + uvs i .obj).
- Dekorationer runt huset (`src/editor/decor.mjs`, `p.decor`): en egen grupp i trädet, med x, z, riktning och höjd per dekoration, i exporten som referenser, och rensningsytan växer med dem.
- Innertaket under platta tak flimrade (samma plan som takets undersida): rättat, 3 mm (`CEILING_GAP`).

**Det som var på gång när vi tog en sväng:** dekorationernas steg 2 och 3:
- Steg 2 (planvyn): byggt 2026-11-23, oprovat i webbläsare: dra en dekoration i planvyn med snappning mot rutnät och mot husets fyra väggar (vänd utåt). Hörn och delar (wings) snappar inte än.
- Steg 3: dra i 3D (Lars 2026-11-23: väntar, inte nu).
- Lägre prioritet: glans och metall i förhandsvisningen av objekt (de ritas matta), färg i objektsidan `/items`.
- Ej provat i spelet: ett hus exporterat med dekorationer (referenserna, och att rensningsytan växer).

## 1. Typ av byggnad (FS25-typ) ska kunna ändras

**Problemet:** `kind` (hus, skjul, hönshus, ladugård, fårhus, fordonsbutik, bensinmack, silo ...) väljs när byggnaden skapas och går inte att ändra. Den bestämmer både möbler/objekt och vad som skrivs i spelets XML (typ, butikskategori, spelobjekt). Lars gjorde en affär av ett hus och den exporteras som boningshus: huset ligger i butikskategorin för bostadshus (`farmhouses`) och bär en sovplats (som gör det till `farmhouse`).

**Idén (Lars):** 1. bygg en byggnad, 2. välj typ för FS25, 3. lägg till spelobjekt. Form och funktion är skilda saker.

**Att bygga, i ordning:**
1. **(Byggt 2026-11-23, oprovat i spelet: inställningen "Var den finns i butiken", `shopCategory`)** **Butikskategori och sovplats för enkla byggnader:** hus och skjul som är vanliga dekorationsbyggnader (`simplePlaceable`) får ett val för var de hamnar i butiken (Bostadshus, Butiker, Skjul, Övrigt). Litet; löser affären utan att byta typ.
2. **(Byggt 2026-11-23, oprovat i webbläsare: kortet "Typ av byggnad" i Spel-fliken, `changeKind` i model.mjs)** **Byt typ mellan byggnader som delar bygget:** hus, skjul, fordonsbutik, bensinmack, silo. Formen, öppningar, delar och dekorationer behålls, möbler som finns i den nya typens katalog behålls (de andra listas innan man bekräftar), den nya typens obligatoriska spelobjekt läggs till. Idéer: en funktion i modellen som tar en sparad byggnad och en ny typ och ger inställningarna + en lista på vad som tappades; ett bekräftelsesteg i redigeraren.
3. **Till och från djurbyggnader:** svårast (hage, staket, djurantal, foder). Antingen ett val med tydlig varning, eller att man kopierar bara formen till en ny byggnad av den typen.

**Öppet:** vad affären ska vara i spelet (dekorationsbyggnad i butikskategorin Butiker, riktig fordonsbutik, ...). Räcker steg 1 först?

## 2. Staket och grindar

**Beslut (Lars):**
- Staket på hus är osäkert och hör kanske hemma i kartappen (där man ser marken runtom). Vi bygger inget allmänt gårdsstaket här nu. Staketet förblir en sak för djurbyggnadernas hage.
- Hagar ska kunna ha grindar.
- Staket ska vara en egen grupp i trädet (inte under Spelobjekt).

**Hur spelet gör grindar (läst i spelets filer):** en husbandry-fence kan delas i `<sections>`: `<section segmentId="GATE4m">` mellan två noder (`gateStart`, `gateEnd`) och `<section segmentId="SEGMENT">` för resten (exempel: `brandless/animalHusbandries/horseBarn/horseBarn.xml`, fence-definitionen `fencesFarmLevel03.xml`). Grindsegmentet är 4 m (`GATE4m`, `FenceGate`), animerat, med en trigger man öppnar med handen och en AI-spärr (förare väntar framför grinden). Våra husbandry skriver idag en enda sektion utan grindar och använder `cowFence`/`chickenNetFence`/`sheepNetFence`.

**Att bygga, i ordning:**
1. Flytta staketet till en egen grupp "Staket" i trädet (ingen ny funktion).
2. Grindar: en markering på en sträcka av staketet (position längs det, 4 m lång), ritad i planvyn, flera tillåtna. Exporten delar staketet i sektioner, med noder för grindens start och slut. Utseendet blir ett gårdsstaket som har ett grindsegment (`fencesFarmLevel01-05`); de djurspecifika näten är inte kontrollerade för grind.
3. Prov i spelet med en ladugård med grind.

**Öppet:** om andra grindlängder än 4 m går; hur djurens gångyta (navigeringen) beter sig med en grind (idag är hagen öppen mot byggnaden och konturen har varit känslig: `navContourNodes`); hönshuset har ingen grind på Lars uttryckliga val. Vilken djurtyp först med grind (ladugård eller får).

## 2b. Varuhus (byggt 2026-11-23, oprovat i spelet)

Lars ville ha en affär där man både köper och säljer varor, med val från listor: spelets `warehouse`-typ (se CLAUDE.md "Warehouse kind"). Typen "Varuhus" finns bland byggnadstyperna och en byggnad kan bytas till den.

## 3. Staket som sluten ring och grindar på gårdsstaket

Väntar tills Lars vet om det ska vara i kartappen. Om det byggs här: sluten ring runt hela byggnaden (konturen stängs med en rak linje från sista till första stolpen, `navContourNodes` måste hantera det), grindar som en lucka eller en riktig grind.
