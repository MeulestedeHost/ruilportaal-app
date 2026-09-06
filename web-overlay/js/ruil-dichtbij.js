// ruil-dichtbij.js — lijstjes uitwisselen met een toestel naast je, zonder internet.
//
// WAT DE NATIVE LAAG WEL EN NIET DOET
// De plugin RuilDichtbij (Swift/Java) is met opzet dom gehouden: ze zoekt
// toestellen, maakt verbinding en geeft één tekst door. Alle betekenis — wat een
// pakket is, wie wat kan geven — zit hier in JavaScript. Dat is bewust: native
// code kan op dit toestel niet gecompileerd of getest worden, JavaScript wel.
// Hoe minder logica daar zit, hoe minder er onopgemerkt fout kan gaan.
//
// Het protocol zelf (maakPakket / leesPakket / vergelijk) staat in
// ruil-protocol.js: puur, zonder imports, en daardoor met een gewone Node-test
// na te rekenen. Dit bestand doet de rest — ophalen, plugin aansturen, scherm.

import { supabase } from "/js/supabase.js";
import { maakPakket, leesPakket, vergelijk } from "/js/ruil-protocol.js";

const TABEL = "stickers";

// Nearby Connections (Android) begrenst een bytes-payload op 32 kB. Een kind
// met een volle lijst zit rond 10 kB, dus dat volstaat ruim — maar we laten het
// liever netjes weten dan halverwege afkappen.
const MAX_PAKKET_BYTES = 30000;

let plugin = null;
let luisteraars = [];
let bezig = false;

/** Opent het scherm en start het zoeken. Aangeroepen vanuit app-native.js. */
export async function open(kindId) {
  if (bezig) return;
  plugin = window.Capacitor?.registerPlugin?.("RuilDichtbij");
  if (!plugin) throw new Error("de native laag is niet beschikbaar in deze omgeving");

  const mij = await laadEigenLijst(kindId);
  const scherm = bouwScherm(mij);
  document.body.appendChild(scherm.wortel);
  bezig = true;

  try {
    await start(mij, scherm);
  } catch (fout) {
    scherm.melden("Zoeken kon niet starten: " + (fout?.message || fout), "fout");
  }
}

// ---------------------------------------------------------------------------
// Eigen lijst ophalen
// ---------------------------------------------------------------------------

/**
 * Haalt de zoek- en dubbellijst van dit kind op.
 *
 * Met een kopie in localStorage, want de hele functie bestaat net om te werken
 * waar géén internet is. Zonder die kopie zou "ruilen zonder internet" alsnog
 * stukgaan op de allereerste stap.
 */
async function laadEigenLijst(kindId) {
  const naam = voornaamVan(document.getElementById("kind-naam")?.textContent);
  const sleutel = "ruil-dichtbij:kind:" + kindId;

  try {
    const { data, error } = await supabase
      .from(TABEL)
      .select("nummer,status,aantal")
      .eq("kind_id", kindId);
    if (error) throw error;

    const lijst = maakPakket(naam, data || []);
    try {
      window.localStorage.setItem(sleutel, JSON.stringify(lijst));
    } catch {
      // Volle of geblokkeerde opslag mag het ruilen zelf niet tegenhouden.
    }
    return lijst;
  } catch (fout) {
    console.warn("[ruil-dichtbij] online ophalen mislukt, val terug op kopie", fout);
    const bewaard = window.localStorage.getItem(sleutel);
    if (!bewaard) {
      throw new Error(
        "je lijst staat nog niet op dit toestel. Open deze pagina één keer mét internet, daarna werkt ruilen ook zonder."
      );
    }
    return JSON.parse(bewaard);
  }
}

/**
 * Enkel de voornaam, nooit de volledige naam.
 *
 * Die naam wordt letterlijk uitgezonden: bij Nearby Connections is het de
 * endpointnaam, bij MultipeerConnectivity de displayName van de peer, en beide
 * zijn zichtbaar voor élk toestel in de buurt dat luistert — ook toestellen die
 * nooit verbinding maken. "Guus" volstaat volledig om te weten met wie je staat
 * te ruilen; "Guus Rombaut" rondstrooien op een schoolplein niet.
 */
function voornaamVan(volledig) {
  const eerste = String(volledig || "").trim().split(/\s+/)[0];
  return eerste || "Onbekend";
}

// ---------------------------------------------------------------------------
// Native laag aansturen
// ---------------------------------------------------------------------------

async function start(mij, scherm) {
  const pakket = JSON.stringify(mij);
  if (pakket.length > MAX_PAKKET_BYTES) {
    throw new Error("je lijst is te groot om in één keer door te sturen");
  }

  luisteraars.push(
    await plugin.addListener("status", ({ staat, boodschap }) => {
      scherm.melden(boodschap || staat, staat === "fout" ? "fout" : "info");
    })
  );

  luisteraars.push(
    await plugin.addListener("peerGevonden", ({ naam }) => {
      scherm.melden(`Verbonden met ${naam}. Lijstjes uitwisselen…`, "info");
    })
  );

  luisteraars.push(
    await plugin.addListener("peerData", ({ pakket: binnen }) => {
      try {
        const ander = leesPakket(binnen);
        scherm.toonResultaat(ander, vergelijk(mij, ander));
      } catch (fout) {
        scherm.melden(fout.message, "fout");
      }
    })
  );

  scherm.melden("Zoeken naar toestellen in de buurt…", "info");
  await plugin.start({ naam: mij.naam, pakket });
}

async function stop() {
  for (const l of luisteraars) {
    try {
      await l.remove();
    } catch {
      // Een luisteraar die al weg is, hoeft het sluiten niet te blokkeren.
    }
  }
  luisteraars = [];
  try {
    await plugin?.stop();
  } catch (fout) {
    console.warn("[ruil-dichtbij] stoppen mislukt", fout);
  }
  bezig = false;
}

// ---------------------------------------------------------------------------
// Scherm
// ---------------------------------------------------------------------------

function bouwScherm(mij) {
  const wortel = document.createElement("div");
  wortel.className = "rd-scherm";
  wortel.setAttribute("role", "dialog");
  wortel.setAttribute("aria-modal", "true");
  wortel.setAttribute("aria-label", "Ruil dichtbij");
  wortel.innerHTML = `
    <div class="rd-balk">
      <h2 class="rd-titel">Ruil dichtbij</h2>
      <button type="button" class="btn btn--outline btn--sm rd-sluit">Sluiten</button>
    </div>
    <div class="rd-inhoud">
      <p class="rd-melding" role="status" aria-live="polite"></p>
      <div class="rd-resultaat hidden"></div>
    </div>
  `;

  const meldingEl = wortel.querySelector(".rd-melding");
  const resultaatEl = wortel.querySelector(".rd-resultaat");

  wortel.querySelector(".rd-sluit").addEventListener("click", async () => {
    await stop();
    wortel.remove();
  });

  return {
    wortel,
    melden(tekst, soort) {
      meldingEl.textContent = tekst;
      meldingEl.className = "rd-melding" + (soort === "fout" ? " rd-melding--fout" : "");
    },
    toonResultaat(ander, { ikGeef, ikKrijg }) {
      this.melden(`Lijstjes van ${mij.naam} en ${ander.naam} vergeleken.`, "info");
      resultaatEl.classList.remove("hidden");
      resultaatEl.innerHTML = "";
      resultaatEl.appendChild(blok(`${mij.naam} kan geven aan ${ander.naam}`, ikGeef, "geef"));
      resultaatEl.appendChild(blok(`${ander.naam} kan geven aan ${mij.naam}`, ikKrijg, "krijg"));
    },
  };
}

function blok(titel, regels, soort) {
  const sectie = document.createElement("section");
  sectie.className = "rd-blok rd-blok--" + soort;

  const kop = document.createElement("h3");
  kop.className = "rd-blok__titel";
  kop.textContent = `${titel} (${regels.length})`;
  sectie.appendChild(kop);

  if (!regels.length) {
    const leeg = document.createElement("p");
    leeg.className = "form-meta";
    leeg.textContent = "Deze keer niets — volgende keer beter.";
    sectie.appendChild(leeg);
    return sectie;
  }

  const lijst = document.createElement("ul");
  lijst.className = "rd-lijst";
  for (const regel of regels) {
    const item = document.createElement("li");
    item.className = "rd-lijst__item";
    item.textContent = regel.code + (regel.aantal > 1 ? ` ×${regel.aantal}` : "");
    lijst.appendChild(item);
  }
  sectie.appendChild(lijst);
  return sectie;
}
