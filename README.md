# Ruilportaal — iOS- en Android-app

Native app rond de bestaande website in [`../mijnportaal`](../mijnportaal), gebouwd
met Capacitor. De app toont dezelfde pagina's als de website en voegt er één ding
aan toe dat een website niet kan: **Ruil dichtbij** — twee toestellen naast elkaar
wisselen hun zoek- en dubbellijst rechtstreeks uit, zonder internet.

## Waarom een aparte map en repo

De website-repo wordt rechtstreeks door Cloudflare Pages gedeployed. Een
Xcode-project en een Gradle-project horen niet in die webroot: ze zouden de
deploy vertragen en een native buildfout zou de website kunnen tegenhouden.

    VS_RuilPortaal/
      ├─ mijnportaal/      <- github.com/MeulestedeHost/mijnportaal (de website)
      └─ ruilportaal-app/  <- deze repo

De app **verwacht die buurmap**. `npm run bouw` stopt met een duidelijke melding
als ze ontbreekt.

## Aan de slag

```bash
npm install
npm test          # protocoltests (draaien overal)
npm run bouw      # zet www/ klaar uit ../mijnportaal + web-overlay/
npm run sync      # bouw + kopieer naar de native projecten
```

Daarna, per platform:

```bash
npm run open:android   # Android Studio  (werkt op Windows)
npm run open:ios       # Xcode           (alleen op macOS)
```

Android is het eerste testplatform: dat bouwt en draait gewoon op Windows.

## www/ — wat er in de app-bundel zit

`webDir` wijst **niet** rechtstreeks naar de website-map. `scripts/bouw-web.mjs`
zet een gefilterde kopie klaar in `www/` (niet in git, het is een kopie).

Waarom die tussenstap er is: rechtstreeks naar `../mijnportaal` wijzen kopieerde
de héle map in beide native projecten — inclusief de volledige `.git` van de
website (2,2 MB historiek), alle SQL-migraties met het rechtenmodel, de
e-mailsjablonen en 1,7 MB print-PDF's. Een APK of IPA is een zip die iedereen kan
uitpakken. Het script gebruikt daarom een **allowlist**: alles wat meegaat staat
expliciet in `BRONNEN`. Bij een denylist glipt elke nieuwe map er vanzelf in —
precies zo kwamen `.git/` en `sql/` in de bundel terecht. (4,4 MB → 376 kB.)

Het script zet ook in elke pagina één regel bij:

```html
<script type="module" src="/js/app-native.js"></script>
```

Daardoor blijft de website-repo volledig onaangeroerd: er staat geen enkele regel
app-code in `mijnportaal`, en alle app-specifieke bestanden wonen hier in
`web-overlay/`.

## Ruil dichtbij

| laag | bestand | rol |
| --- | --- | --- |
| injectie | `web-overlay/js/app-native.js` | zet de knop op de kindpagina, alleen in de app |
| protocol | `web-overlay/js/ruil-protocol.js` | wat er over de lijn gaat — puur, getest |
| scherm | `web-overlay/js/ruil-dichtbij.js` | ophalen, plugin aansturen, resultaat tonen |
| Android | `android/…/RuilDichtbijPlugin.java` | Nearby Connections |
| iOS | `ios/App/App/RuilDichtbijPlugin.swift` | MultipeerConnectivity |

De native laag is met opzet dom: zoeken, verbinden, één tekenreeks doorgeven. Alle
betekenis zit in JavaScript. Dat is een bewuste keuze — native code kan op een
Windows-machine niet gecompileerd of getest worden, JavaScript wel. Hoe minder
logica daar zit, hoe minder er onopgemerkt fout kan gaan.

Wat er wordt uitgewisseld is een voornaam plus stickercodes, meer niet. Bewust
géén volledige naam: die naam wordt letterlijk uitgezonden en is zichtbaar voor
elk toestel in de buurt dat luistert, ook zonder verbinding te maken.

De app werkt hiervoor ook zonder internet, maar de lijst moet één keer mét
internet geladen zijn: `ruil-dichtbij.js` bewaart een kopie in `localStorage`.

### Nog te controleren op een echt toestel

De protocollogica is getest (`npm test`, 12 tests) en de schermlaag met
Playwright tegen de gebouwde `www/`. De **native laag is nog nooit gecompileerd**
— er staat geen Xcode en geen Android SDK op de ontwikkelmachine. Bij de eerste
echte build hoort dus:

1. **Android** — twee toestellen, `Ruil dichtbij` op beide openen, rechten
   toestaan. Let op Android 12 en 13: die vragen elk een andere set rechten
   (zie `benodigdeRechten()`).
2. **iOS** — `RuilDichtbijPlugin.swift` moet nog **aan het App-target worden
   toegevoegd in Xcode** (sleep het bestand in de projectboom). Een bestand dat
   enkel in de map staat, wordt niet meegecompileerd. Zonder dat werkt de knop
   niet en zegt de app dat de native laag ontbreekt.
3. De `serviceType` in de Swift-code (`ruilportaal`) en `NSBonjourServices` in
   `Info.plist` moeten gelijk blijven. Lopen ze uiteen, dan vindt de app
   niemand — zonder foutmelding.

## Naar de stores

- **Google Play** — eenmalig $25. Android Studio bouwt een signed AAB.
- **App Store** — Apple Developer Program, €99/jaar, en een Mac met Xcode.
- App-iconen en splash-screen staan nog op de Capacitor-standaard.
- Let op richtlijn **4.2 (Minimum Functionality)** van Apple: een app die enkel
  een website in een WebView toont, wordt geweigerd. "Ruil dichtbij" is precies
  het soort functie dat een website niet kan en dat de app dus rechtvaardigt.

## Testen en troubleshooten

- `npm test` — protocoltests, geen toestel nodig.
- **Android**: `chrome://inspect` in Chrome geeft DevTools op de webinhoud;
  Logcat in Android Studio toont de native kant.
- **iOS**: Safari → Ontwikkelaar → toestel → Ruilportaal geeft de Web Inspector.
- `npm run doctor` — controleert de Capacitor-omgeving.

## Git-scripts

`git-commit-local.ps1` (commit lokaal), `git-push-online.ps1` (push),
`git-pull-latest.ps1` (haal op, weigert bij niet-gecommitte wijzigingen).
`.gitattributes` houdt `gradlew` op LF — met CRLF weigert de Gradle-wrapper te
starten op macOS en Linux.
