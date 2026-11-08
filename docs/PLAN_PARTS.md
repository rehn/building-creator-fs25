# Plan: delar i ett träd, saker på väggar, delar att dela (november 2026)

Fortsättning på `PLAN.md` (steg 4, flera delar). Överenskommet med användaren. Gamla sparningar får gå sönder om det behövs;
det viktiga är ett bra flöde. Varje steg ska vara färdigt, testat (TDD) och körbart innan nästa börjar.

## Mål

- En byggnad är ett **träd av delar**. Huvudbyggnaden är del 0. En del sitter på en vägg på en annan del (föräldern).
  En vinge kan alltså ha en egen vinge (pumphus på en flygel, ännu en flygel).
- På varje vägg finns **saker** i ordning längs väggen: fönster, dörr, tomt hål, grind, hagöppning och delar.
  En del är en sak på förälderns vägg, men tar med sig egna väggar och inställningar. Ett fönster kan bli en dörr: samma sak med andra värden.
- **Delar går att exportera och importera**: ett pumphus som byggts en gång kan sättas på en annan ladugård, ett skjul eller ett hus.

## Regler

- **Fritt djup.** Ingen gräns på antal nivåer. Däremot högst 12 delar totalt (export och spel blir tunga annars).
- **En del får bara möta sin förälder med taket.** Ett tak möter förälderns tak (dalränna, lägre tak under takfoten, gavel, platt tak,
  som dagens vingar). En del som skulle röra ett annat tak än förälderns slås av med en förklaring.
- **Delar får inte överlappa varandra** (takfötter inräknade). Kontrolleras mot alla andra delar, inte bara föräldern. En del som överlappar slås av med en förklaring.
- Saker på en vägg får inte ligga över varandra. Nya fönster hålls undan från en del som står mot väggen (klart).

## Modellen

- `p.wings` blir en lista av delar med `parent` (0 = huvudbyggnaden). `wall` är en sida på föräldern: `front|back|left|right` på huvudbyggnaden, `w<id>End|Left|Right` på en vinge.
  Väggnycklarna `w<id>End|Left|Right` finns redan och räcker för alla djup, så resten av koden som tar väggnycklar (fönster, tapeter, väggzoner, stuprör) fortsätter fungera.
- `wingsOf(P)` räknas rekursivt: varje del får sin ram och sin rektangel från förälderns väggram, och sitt takläge (valley/eave/gable/flat) från förälderns tak
  (förälderns nockriktning, lutning, takfotshöjd). Huvudbyggnaden är specialfallet.
- Taket skärs rekursivt: varje del skär förälderns taksida (`notch`), som för huvudbyggnaden idag.
- Insidan: rummet är föreningen av alla delars golv; varje del har eget innertak (egen våningshöjd) och en passage i förälderns vägg.
- Del får `name` (visas i listor).
- **Material per del, med arv.** Varje del kan ha egna material (väggpanel och färg uppe och nere, delning, taktäckning och takfärg, knutlådor/lister),
  men som standard är de **"samma som föräldern"**. Ett ofyllt fält ärver från förälderns värde (och så uppåt till byggnaden); ett ifyllt fält gäller delen
  (och dess barn, som ärver från den). Bara det som är ifyllt sparas i delen.
  Tekniskt: i dag finns en uppsättning material för hela byggnaden (`walls`, `wallsLow`, `roof` ...). Med egna material per del bygger varje del sina ytor i ett material
  per unikt (plats, panel, färg); likadana material slås ihop så att antalet material i i3d-filen inte växer i onödan.

## Delar att dela

- Ett **delträd** (en del med allt under den) kan sparas som en fil: storlek, våningar, våningshöjd, tak, saker på väggarna (fönster, dörrar, hål, grindar),
  möbler och barndelar. Väggnycklar skrivs om till lokala (delen själv är rot).
- **Importera** lägger delen på en vald vägg i en annan byggnad (ladugård, skjul, hus). Det som delen har satt till "samma som föräldern" följer den nya föräldern (rött på den röda ladugården, vitt på det vita huset); det som delen har satt själv behåller den.
  Möbler av typer som målets katalog saknar tas bort med en notis. Passar den inte på väggen minskas bredden/flyttas längs väggen, annars slås den av med förklaring.
- Först en fil (nedladdning/uppladdning av JSON). Sedan ett "Mina delar"-bibliotek per användare, som "My items" (admin kan dela med alla).

## Gränssnittet (efter att modellen fungerar)

- Shape: "Wings" blir "Parts", en trädlista med namn; vald del får samma reglage som vingkortet har idag; "Add a part to this part".
- Openings: vy per vägg (välj del och vägg, eller klicka på väggen i 3D) med sakerna i ordning från vänster och "+ Add: window · door · doorway · gate · part".
  Tabellen med antal blir kvar som översikt.
- Parts: "Export this part" och "Import a part".

## Ordning

1. Datamodellen: generella väggnycklar, `wingsOf` rekursiv för väggar, golv och rektanglar (med test). **Klart (november 2026):** `wall` på en del är en vägg på huset eller på en tidigare del (föräldern är `wingIdOf(wall)`); `cleanWings` släpper del utan förälder; en del ärver våningar, våningshöjd, halvvåning och taklutning av föräldern (0 = som föräldern) men får inte fler våningar än den; roffäll (`valley`/`eave`/`gable`/`flat`) följer förälderns tak; en del som skulle röra annat än föräldern slås av. Delar på delar syns ännu bara med platt tak och går inte att skapa i gränssnittet (steg 3 och 4). Gamla sparningar behöver ingen översättning: nycklarna är oförändrade.
2. Insidan för nästlade delar: golv, innertak, passager, rum, fönster/dörrar på deras väggar.
3. Taken för nästlade delar (möter bara föräldern).
3b. Material per del med arv ("samma som föräldern" som standard): flera material per byggnad i förhandsvisningen och exporten.
4. Sakerna per vägg: gemensam vy med fönster, dörr, hål, grind och del.
5. Export och import av delar (fil), sedan biblioteket.
6. Fotoguiden och mallarna med den nya modellen; ta bort den gamla vingkoden.
