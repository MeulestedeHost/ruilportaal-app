# Ruilportaal — iOS-app

Dunne Capacitor-wrapper rond de bestaande website in [`../mijnportaal`](../mijnportaal).
Geen aparte UI-code: `capacitor.config.json` wijst `webDir` rechtstreeks naar die map,
dus de app toont dezelfde HTML/JS/CSS als de website, verpakt als native iOS-app.

## Waarom een aparte map + repo

De website-repo (`mijnportaal`) wordt rechtstreeks door Cloudflare Pages gedeployed.
Een Xcode-project (`ios/`, met CocoaPods/SPM-afhankelijkheden en gegenereerde
bestanden) hoort daar niet bij — vandaar een eigen map en git-repo voor de app,
los van de website-deploy.

## Structuur

- `capacitor.config.json` — `webDir: "../mijnportaal"`
- `ios/` — het gegenereerde Xcode-project (alleen op macOS te bouwen/openen)
- `ios/App/App/public/` — kopie van de website, **niet** in git (zie `ios/.gitignore`);
  wordt opnieuw gevuld door `npx cap sync`

## Werken aan de app

Na elke wijziging in `../mijnportaal`:

```bash
npx cap sync
```

Dat kopieert de website opnieuw naar `ios/App/App/public` en werkt de native
afhankelijkheden bij. Openen/bouwen/draaien op een simulator of toestel kan
alleen op macOS met Xcode:

```bash
npx cap open ios
```

## Bluetooth/peer-to-peer-experiment (later)

Losstaand leerdoel: lokale uitwisseling van "gezocht"/"dubbel" tussen twee
toestellen zonder internet, via Apple's `MultipeerConnectivity`-framework
(dezelfde technologie onder AirDrop). Dat vereist een klein stukje Swift/native
code (niet vanuit JavaScript aan te roepen) en komt in een latere stap, als
losse Capacitor-plugin.
