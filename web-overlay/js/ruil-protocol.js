// ruil-protocol.js — wat er over de lijn gaat tussen twee toestellen.
//
// Bewust een eigen bestand zonder één import: geen DOM, geen Supabase, geen
// Capacitor. Daardoor draait dit bestand ongewijzigd in Node en is het met een
// gewone test na te rekenen — terwijl de native laag eronder op dit moment
// nergens gecompileerd kan worden. Alles wat hier getest is, hoeft op een
// toestel niet meer ontdekt te worden.

export const PROTOCOL_VERSIE = 1;

/**
 * Zet databankrijen (public.stickers) om in het pakket dat verstuurd wordt.
 *
 * Wat een kind al in het album heeft maar niet dubbel, gaat niet mee: dat is
 * voor de ander niets waard en zou het pakket alleen groter maken.
 */
export function maakPakket(naam, rijen) {
  const zoekt = [];
  const dubbel = {};
  for (const rij of rijen) {
    if (rij.status === "ZOEKT") zoekt.push(rij.nummer);
    else if (rij.status === "RUILT") dubbel[rij.nummer] = Math.max(1, rij.aantal || 1);
  }
  return { v: PROTOCOL_VERSIE, naam, zoekt, dubbel };
}

/**
 * Leest een binnengekomen pakket en weigert alles wat niet klopt.
 *
 * Dit is de enige plek waar gegevens van een vreemd toestel binnenkomen. Ook al
 * is de tegenpartij vrijwel zeker gewoon de buurman met dezelfde app: er wordt
 * hier gecontroleerd, niet vertrouwd. Een kapot of ouder pakket moet een
 * begrijpelijke melding geven en niet halverwege het scherm laten stranden.
 */
export function leesPakket(tekst) {
  let pakket;
  try {
    pakket = JSON.parse(tekst);
  } catch {
    throw new Error("onleesbaar bericht ontvangen");
  }
  if (!pakket || typeof pakket !== "object" || Array.isArray(pakket)) {
    throw new Error("onleesbaar bericht ontvangen");
  }
  if (pakket.v !== PROTOCOL_VERSIE) {
    throw new Error(
      `het andere toestel gebruikt versie ${pakket.v ?? "?"} van de app en dit toestel versie ` +
        `${PROTOCOL_VERSIE}. Werk allebei de app bij.`
    );
  }
  if (!Array.isArray(pakket.zoekt) || typeof pakket.dubbel !== "object" || pakket.dubbel === null) {
    throw new Error("bericht mist een zoek- of dubbellijst");
  }
  return {
    v: pakket.v,
    naam: typeof pakket.naam === "string" && pakket.naam.trim() ? pakket.naam.trim() : "Onbekend",
    zoekt: pakket.zoekt.filter((code) => typeof code === "string"),
    dubbel: Object.fromEntries(
      Object.entries(pakket.dubbel)
        .filter(([code, aantal]) => typeof code === "string" && Number.isFinite(Number(aantal)))
        .map(([code, aantal]) => [code, Math.max(1, Math.floor(Number(aantal)))])
    ),
  };
}

/**
 * Bepaalt wat de twee kinderen elkaar kunnen geven.
 *
 * Dezelfde regel als get_matches() in de databank: een match is "de één heeft
 * dubbel wat de ander zoekt". Bewust geen slimmere logica (eerlijk verdelen,
 * evenveel voor evenveel): kinderen regelen dat zelf beter dan een app.
 */
export function vergelijk(mij, ander) {
  const anderZoekt = new Set(ander.zoekt);
  return {
    ikGeef: Object.keys(mij.dubbel)
      .filter((code) => anderZoekt.has(code))
      .map((code) => ({ code, aantal: mij.dubbel[code] }))
      .sort((a, b) => a.code.localeCompare(b.code, "nl")),
    ikKrijg: mij.zoekt
      .filter((code) => Object.prototype.hasOwnProperty.call(ander.dubbel, code))
      .map((code) => ({ code, aantal: ander.dubbel[code] }))
      .sort((a, b) => a.code.localeCompare(b.code, "nl")),
  };
}
