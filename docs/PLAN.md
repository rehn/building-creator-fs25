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
3. **Insida för alla byggnader och val av öppningsbar dörr.** Bostadshuset blir en byggnad man kan gå in i, bottenvåningen.
4. **Flera delar.** Flygeln blir en del i listan, plus tillbyggnader, och insidan sträcker sig över alla delar.
5. **Claude-guiden** (`fromPhotos.mjs`) uppdateras till den nya modellen, så att foton blir delar, zoner, öppningar och objekt.

## Senare

- Övervåningar man kan gå på, med trappor och bjälklag.
- Fler byggnadstyper: får, skjul, fordonsverkstad.
- Mjölkning (kogård med mjölkrobot), halm och gödsel.
