// bouw-web.mjs — zet www/ klaar: de webinhoud die in de app-bundel terechtkomt.
//
// WAAROM DEZE STAP BESTAAT
// Capacitor's webDir wees eerst rechtstreeks naar ../mijnportaal. Dat kopieert
// die map ONGEFILTERD in beide native projecten, en dus ook: de volledige .git
// van de website (2,2 MB historiek), alle SQL-migraties met het RLS- en
// rechtenmodel, de e-mailsjablonen, de PowerShell-scripts en 1,7 MB print-PDF's
// met vlaggen. Een APK of IPA is een zipbestand dat iedereen kan uitpakken, dus
// dat is niet alleen ballast maar ook onnodig prijsgeven hoe de databank in
// elkaar zit.
//
// ALLOWLIST, GEEN DENYLIST
// BRONNEN hieronder is een expliciete lijst van wat de app meeneemt. Bewust
// géén "alles behalve …": bij een denylist glipt elke nieuwe map op de website
// er vanzelf in — precies zo kwamen .git en sql/ in de bundel terecht. Nu moet
// iemand hier een regel bijzetten, en dat is een bewuste keuze die in de
// commit zichtbaar is.
//
// Gebruik:  npm run bouw        (of: npm run sync, die dit eerst draait)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HIER = path.dirname(fileURLToPath(import.meta.url));
const PROJECT = path.resolve(HIER, "..");
const WEBSITE = path.resolve(PROJECT, "..", "mijnportaal");
const OVERLAY = path.join(PROJECT, "web-overlay");
const DOEL = path.join(PROJECT, "www");

// Wat gaat er mee de app in? Paden zijn relatief t.o.v. de website-map.
const BRONNEN = [
  { pad: "*.html", waarom: "de pagina's zelf" },
  { pad: "css", waarom: "opmaak" },
  { pad: "js", waarom: "toepassingscode" },
  { pad: "print/Ruilblad_Panini_FIFA_2026_Nieuw.pdf", waarom: "gelinkt vanaf de startpagina" },
];

// Wordt vlak voor </body> in elke pagina gezet. Zo blijft de website-repo
// volledig onaangeroerd: alle app-specifieke code woont hier, en de website
// weet niet eens dat er een app bestaat.
const INJECTIE = '  <script type="module" src="/js/app-native.js"></script>';

function fout(boodschap) {
  console.error("\n  FOUT: " + boodschap + "\n");
  process.exit(1);
}

if (!fs.existsSync(WEBSITE)) {
  fout(
    `de website-map is niet gevonden op ${WEBSITE}.\n` +
      "  Dit project verwacht de repo 'mijnportaal' als buurmap:\n\n" +
      "      VS_RuilPortaal/\n" +
      "        ├─ mijnportaal/      <- github.com/MeulestedeHost/mijnportaal\n" +
      "        └─ ruilportaal-app/  <- deze repo\n"
  );
}

/** Kopieert een map recursief en geeft het aantal gekopieerde bestanden terug. */
function kopieerMap(van, naar) {
  fs.mkdirSync(naar, { recursive: true });
  let aantal = 0;
  for (const item of fs.readdirSync(van, { withFileTypes: true })) {
    const bron = path.join(van, item.name);
    const bestemming = path.join(naar, item.name);
    if (item.isDirectory()) aantal += kopieerMap(bron, bestemming);
    else {
      fs.copyFileSync(bron, bestemming);
      aantal++;
    }
  }
  return aantal;
}

/** Lost één BRONNEN-regel op naar concrete bestanden/mappen. */
function kopieerBron(regel) {
  // Enige patroonvorm die we ondersteunen: *.ext in de hoofdmap. Meer glob dan
  // dat heeft dit project niet nodig, en een halve glob-implementatie die
  // stiekem iets anders doet dan verwacht is hier gevaarlijker dan nuttig.
  if (regel.pad.startsWith("*.")) {
    const ext = regel.pad.slice(1);
    const bestanden = fs.readdirSync(WEBSITE).filter((n) => n.endsWith(ext));
    bestanden.forEach((n) => fs.copyFileSync(path.join(WEBSITE, n), path.join(DOEL, n)));
    return bestanden.length;
  }

  const bron = path.join(WEBSITE, regel.pad);
  if (!fs.existsSync(bron)) {
    fout(`'${regel.pad}' staat in BRONNEN maar bestaat niet in ${WEBSITE}.`);
  }
  const bestemming = path.join(DOEL, regel.pad);
  if (fs.statSync(bron).isDirectory()) return kopieerMap(bron, bestemming);
  fs.mkdirSync(path.dirname(bestemming), { recursive: true });
  fs.copyFileSync(bron, bestemming);
  return 1;
}

/** Zet het app-script in elke pagina, vlak voor </body>. */
function injecteerAppScript() {
  const paginas = fs.readdirSync(DOEL).filter((n) => n.endsWith(".html"));
  const overgeslagen = [];
  for (const naam of paginas) {
    const pad = path.join(DOEL, naam);
    const html = fs.readFileSync(pad, "utf8");
    if (html.includes("app-native.js")) continue;
    if (!/<\/body>/i.test(html)) {
      overgeslagen.push(naam);
      continue;
    }
    fs.writeFileSync(pad, html.replace(/<\/body>/i, INJECTIE + "\n</body>"), "utf8");
  }
  if (overgeslagen.length) {
    fout(`geen </body> gevonden in: ${overgeslagen.join(", ")} — script niet geplaatst.`);
  }
  return paginas.length;
}

function grootteVan(map) {
  let bytes = 0;
  for (const item of fs.readdirSync(map, { withFileTypes: true })) {
    const p = path.join(map, item.name);
    bytes += item.isDirectory() ? grootteVan(p) : fs.statSync(p).size;
  }
  return bytes;
}

// ---- bouwen ----------------------------------------------------------------

fs.rmSync(DOEL, { recursive: true, force: true });
fs.mkdirSync(DOEL, { recursive: true });

console.log(`\n  Website : ${WEBSITE}`);
console.log(`  Doel    : ${DOEL}\n`);

for (const regel of BRONNEN) {
  const aantal = kopieerBron(regel);
  console.log(`  + ${regel.pad.padEnd(46)} ${String(aantal).padStart(3)} bestand(en)  — ${regel.waarom}`);
}

if (fs.existsSync(OVERLAY)) {
  const aantal = kopieerMap(OVERLAY, DOEL);
  console.log(`  + ${"web-overlay/ (app-only)".padEnd(46)} ${String(aantal).padStart(3)} bestand(en)  — code die alleen in de app draait`);
}

const paginas = injecteerAppScript();

// Laat zien wat er NIET meegaat: zo blijft zichtbaar dat het een keuze is.
const genegeerd = fs
  .readdirSync(WEBSITE)
  .filter((n) => !fs.existsSync(path.join(DOEL, n)))
  .filter((n) => n !== "print");

console.log(`\n  app-native.js geplaatst in ${paginas} pagina's`);
console.log(`  niet meegenomen: ${genegeerd.join(", ")}`);
console.log(`\n  www/ is ${(grootteVan(DOEL) / 1024).toFixed(0)} kB\n`);
