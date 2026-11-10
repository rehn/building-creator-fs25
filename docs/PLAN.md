# Plan: en modell för alla byggnader

Beslutad med Lars i november 2026. Gamla sparningar får gå sönder om det behövs; målet är en bra och lättanvänd app.

## Målet

Varje byggnad, oavsett om det är bostadshus, hönshus, ladugård eller senare verkstad, byggs på samma sätt:

1. **Form:** en eller flera rektanglar.
2. **Väggar:** fönster och dörrar per sida, och väggarna kan ha två material (undre och övre zon).
3. **Insida:** bottenvåningen går att gå in i, med samma inredning som ladugården har idag.
4. **Spelobjekt:** de saker spelet behöver (sovplats, foder, pallar, lastplats …) läggs till som objekt.

Det som skiljer byggnadstyperna åt blir bara två saker:
- **vilka spelobjekt och vilken inredning som finns att välja**;
- **vilken FS25-typ exporten blir** (bostad, hönsgård, kogård …).

## Krav

- Alla byggnader byggs av en eller flera rektanglar.
- Antal fönster och dörrar väljs per sida och våning, som idag.
- Varje fönster och dörr kan flyttas i sidled och höjdled, som idag.
- Varje dörr kan väljas som öppningsbar eller inte.
- Insidan fungerar som i ladugården idag, och likadant i alla byggnader.
- Sovplatsen (ikon och box) är ett objekt man lägger till. Likadant pallar, foder och andra ikoner som behövs.
- Väggarna kan delas materialmässigt, till exempel en lada med putsad undervåning och plank på övervåningen.
- Allt bra vi redan har finns kvar (se "Det vi behåller").

## Beslut

1. **Våningar:** bara bottenvåningen går att gå in i, för nu. Inga trappor och inga bjälklag man går på. Övervåningar är stängda inifrån (ett tak över bottenvåningen).
2. **Delar fäster mot varandra.** Det blir inga fria rektanglar med automatiska takskarvar.
3. **Väggzoner:** två räcker, en undre och en övre. Fallet som behövs är en lada med putsad undervåning och plank ovanför.
4. **Ordningen** nedan gäller.

## Modellen

### 1. Delar (rektanglar)

Byggnaden är en lista med delar.
- **Huvuddel:** första delen står fritt.
- **Övriga delar:** fäster mot en vägg på en annan del, med position längs väggen, bredd och längd ut från väggen.

Två sorters delar:
- **Flygel:** samma takfot och taklutning som delen den sitter på.
  - På en långsida möts taken i en ränndal: L i ett hörn, T på mitten.
  - På en gavel blir den en lägre tillbyggnad under gaveln.
  - Det här finns redan som `wingOf` i `layout.mjs` och ska bli den första delen av den nya modellen.
- **Tillbyggnad:** lägre än delen den sitter på, med eget sadeltak eller pulpettak mot väggen. Till exempel mjölkrum, skjul och farstu.

L, T, U, Z och flera tillbyggnader går alla att bygga så.

### 2. Fönster, dörrar och luckor

Fungerar som nu: ett antal per sida och våning, och var och en kan flyttas och få egen storlek och stil. Det nya:
- **Väggar:** varje del har sina egna väggar i listan.
- **Öppningsbar:** ett val per dörr (`opens`). En öppningsbar dörr leder in i rummet bakom och exporteras med animation och trigger. En dörr som inte är öppningsbar är bara fasad.
- **Luckor:** en ny sorts öppning, till exempel höluckor uppe i gaveln eller på loftväggen.

### 3. Väggmaterial i två zoner

En undre och en övre zon, var och en med egen beklädnad (puts, lockpanel, liggande panel …) och egen färg.
- **Gränsen** sitter vid en våning eller på en vald höjd.
- **Per del:** kan sättas per del, så att en logflygel kan vara helt i panel.
- **Utan delning** är zonerna lika, som idag.

### 4. En insida för alla byggnader

- **Alla byggnader byggs som ladugården nu:** tunna väggar med insida, kollision, dörrar som öppnas och placerade inredningsdelar som ordnas i planvyn.
- **Bostadshuset** får också en riktig insida, med en egen katalog (möbler med mera). De nuvarande låtsasrummen bakom fönstren kan finnas kvar som tillval.
- **Över flera delar** blir insidan ett sammanhängande rum: golvet är unionen av delarnas rektanglar, och väggarna är dess kanter. Inredning kan stå i flygeln, och kor också.

### 5. Spelobjekt

Sovplats, foderplats, balplats, äggpallar, djurlastplats, infoområde och senare fler är objekt i en lista. De läggs till, dras, vrids och skalas i samma vy som inredningen (utanför väggarna).
- **Exportens FS25-typ** räknas ut från objekten. En sovplats ger till exempel ett bostadshus, och foder och lastplats för kor ger en kogård.
- **Varningar:** appen säger till om något saknas, till exempel en kogård utan foderplats, eller om två objekt inte går ihop.

**Hagen** (staketet) är också ett objekt:
- **Lägga till:** man lägger till en "Hage" och drar ut den från huset.
- **Snäpper mot huset:** dess två hörn mot huset fäster mot husets hörn (alla delars, så att en hage kan ligga i innerhörnet på ett L), mellan dem mot väggarna, och resten mot rutnätet.
- **Djup:** hur långt ut den går dras i den yttre kanten. Ersätter dagens "Pasture side" och "Pasture depth".
- **Djurens öppning:** kornas dörröppning och hönsens lucka hamnar på väggen hagen ligger mot och följer med när hagen flyttas. Kornas tråg står längs den väggen.
- **Spelets regler kollas**, med varning och förslag på rättelse:
  - hagen är för liten (kor minst 16 m bred, höns 12 × 6 m);
  - djurens öppning ligger utanför hagen;
  - en dörr eller ett annat objekt hamnar inne i hagen.
- **Rektangel räcker:** hagen är bara startformen. FS25 låter spelaren dra staketet till vilken form som helst när byggnaden placeras.
- **Ersätter** dagens "Game places", som har en fast uppsättning per byggnadstyp.

### 6. Det vi behåller

- Ålder och väder (`age.mjs`).
- Färger och ytor (`surfaces.mjs`).
- Takformer (sadel, valm, platt), kupor, farstukvistar och skärmtak.
- Hängrännor och stuprör, takryttare och skorsten.
- Fönster- och dörrstilarna (`openings.mjs`).
- Importerade objekt (My items).
- Mallar från foton via Claude, både via API och via chatt.
- Export till Giants Editor och som mod.
- Förinställda byggnader och delade mallar.

Gamla sparningar konverteras där det går.

## Ordning

Varje steg ska vara färdigt, testat (TDD) och kontrollerat i webbläsaren innan nästa börjar.

1. **Väggmaterial i zoner.** Klart (november 2026): "Two materials on the walls" under Surfaces, delat vid bottenvåningens överkant eller på en vald höjd, med vattbräda i skarven.
2. **Spelobjekt som objekt, hagen också.** Klart (november 2026): sektionen "Game objects" och planvyn "Move them in the plan view".
3. **Insida för alla byggnader och val av öppningsbar dörr.** Klart (november 2026): bostadshusets bottenvåning går att gå in i, med innertak och möbler; varje dörr har "Opens".
4. **Flera delar.** Klart (november 2026): upp till fyra flyglar per byggnad (L, T, U, Z), egen vägg, plats, storlek, våningar, 1½-plan och taklutning (4a), och insidan är ett sammanhängande rum över alla delar, med gångväg genom husväggen, golv, väggar, kollision, dörrar och möblering i flyglarna (4b). Tillbyggnader med eget tak mot en vägg och flyglar på flyglar återstår.
5. **Claude-guiden** (`fromPhotos.mjs`) är uppdaterad till den nya modellen (klart november 2026): delar, väggmaterial, dörrar som öppnas och spelobjekt, med en kontroll av svaret i wizarden.

## Senare

- Övervåningar man kan gå på, med trappor och bjälklag.
- Olika våningshöjd för olika våningar: gjort (november 2026) för byggnaden och för delar (bottenvåningens höjd + höjd på våning 2 och 3, 0 = som bottenvåningen); kvar att prova i webbläsaren, och att trappor/övervåningar (ovan) tar hänsyn till det när de kommer.
- Delning i sektioner (split), tvärs längden, samma skal: byggnaden behåller bredd, höjd, tak och ytterväggar, men delas med tvärväggar i sektioner som har egna våningar (totalhöjden är densamma). Idén kom i november 2026 (en del "i förlängning" på gaveln prövades först och togs bort igen: delar behåller sitt tak som förut, och olika takhöjd eller bredd är delarnas sak). Rum bakom fönster väljs per fönster som förut. Steg:
  1. (Klart, november 2026: väggarna finns, med dörrar och fönster som vanliga öppningar; djurens gångyta förbi dem är klar, november 2026.) Tvärväggar: `p.splits` = [{at (m från början av längdaxeln), door (0 ingen, 1 öppen, 2 dörr som öppnas, 3 stängd dörr), doorAt}], upp till 4. Väggen går till taket (gavelformad), har ytterväggens material på båda sidor (två zoner som ytterväggen), kollision med öppning för dörren, och djurens gångyta får samma spärrar som innerväggar.
  2. (Klart, november 2026, fönstergeneratorn "windows per wall" tar hänsyn till sektionerna.) Sektioner: `p.secs[i]` = {floors, ground-floor height} med totalhöjden fast (övriga våningar delar resten). Fönstrens våning och höjd följer sektionen där de står (layoutWall: våningshöjderna beror på läget längs väggen); innertak per sektion; fönster på en våning som sektionen inte har döljs som annars.
  3. (Klart, november 2026, skiljeväggen kan dras i planvyn för inredning, eller ställas med reglaget.) Trädet: byggnad › sektion › våning › vägg (+ en nod för varje tvärvägg med dörr), och en knapp "Split here" med reglage för var, som i planvyn kan dras.
  4. (Klart, november 2026: rummet delas av väggarna, autoinredningen håller sig inom sektionerna men görs inte per sektion, fotoguiden har "sections", och golden-saves har fem sparningar med sektioner.) Inne: roomOf delar rummet i sektioner (möbler får inte ligga över tvärväggen), autoFurnish per sektion, fotoguiden (`fromPhotos.mjs`) och golden-saves.
  Dörr i den delade väggen för "del i förlängning" (bred passage, hel vägg, öppen dörröppning, dörr som öppnas eller står stängd): gjort på ett annat sätt (november 2026): delen har "Wide opening" av/på, och med den av är väggen hel och dörrar och fönster läggs i den som vanliga öppningar; tvärväggens dörr bör bli en vanlig öppning på samma sätt.
- Fler byggnadstyper: får, skjul, fordonsverkstad.
- Mjölkning (kogård med mjölkrobot), halm och gödsel.
- LOD (nivåer av detalj) för att spara resurser i spelet när man är en bit ifrån: till exempel en enklare modell utan inredning, möbler, räfflor och små detaljer på avstånd, och vid riktigt långt avstånd bara skalet. Det som kostar mest är insidan (möbler, rum, stolpar och reglar), så börja där. Kräver att i3d-exporten delar upp scenen i detaljnivåer med avstånd (och att förhandsvisningen kan visa dem), och bör mätas i spelet (trianglar och ritanrop) innan och efter.
- Belysning: lampor ute (vid dörrar, på gaveln, en stolpe vid gården) och inne (i taket, vid dörren, i stallet), som tänds på kvällen och när det är mörkt. Behöver lampor som objekt man kan placera (läge, typ, höjd), ljuskällor i i3d (och hur FS25 styr på/av efter tid på dygnet), lampornas utseende i förhandsvisningen, och en gräns för hur många ljuskällor en byggnad får så att spelet inte tappar prestanda (hänger ihop med LOD).
- Innerväggar och djuren: gjort i gångytan (november 2026): väggens delar som når golvet blockerar, en öppen dörröppning är en väg, och en vägg med dörr som öppnas räknas som stängd (djur öppnar inte dörrar). Provat i FS25 och det fungerar (november 2026).
- Innerväggar med samma texturer som ytterväggen: kunna välja ytterväggens material (panel, puts, undre och övre zon) på en innervägg, särskilt nyttigt i alla byggnader utom bostadshus.
