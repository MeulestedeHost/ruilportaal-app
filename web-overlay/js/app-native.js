// app-native.js — het enige app-specifieke script dat in élke pagina belandt.
//
// scripts/bouw-web.mjs zet hier een <script>-verwijzing naar vlak voor </body>
// van elke pagina in www/. De website-repo (mijnportaal) blijft daardoor
// volledig onaangeroerd: daar staat geen enkele regel app-code, en de site op
// Cloudflare Pages weet niet dat deze app bestaat.
//
// Dit bestand blijft bewust klein. Het beslist alleen WAAR en WANNEER er een
// native functie bij komt; het echte werk staat in de modules die het lui
// inlaadt, zodat een pagina die de functie niet toont er ook geen code voor
// hoeft te downloaden en te parsen.

const native = Boolean(window.Capacitor?.isNativePlatform?.());

// In een gewone browser (bv. als je www/ lokaal serveert om te testen) doet
// deze module niets. Zo blijft elke pagina exact de website die ze al was.
if (native) {
  zetRuilDichtbijKlaar();
}

/**
 * Voegt op de kindpagina een kaart "Ruil dichtbij" toe: uitwisselen van
 * zoek- en dubbellijsten met een toestel naast je, zonder internet.
 *
 * Alleen op kind.html — daar hoort het thuis, want de lijsten die uitgewisseld
 * worden zijn van één specifiek kind.
 */
function zetRuilDichtbijKlaar() {
  const stickerKaart = document.getElementById("sticker-kaart");
  const lijsten = document.querySelector(".sticker-lists");
  const kindId = new URLSearchParams(window.location.search).get("id");
  if (!stickerKaart || !lijsten || !kindId) return;

  const stijl = document.createElement("link");
  stijl.rel = "stylesheet";
  stijl.href = "/css/ruil-dichtbij.css";
  document.head.appendChild(stijl);

  const kaart = document.createElement("section");
  kaart.className = "card";
  kaart.innerHTML = `
    <h2>Ruil dichtbij</h2>
    <p class="form-meta">
      Sta je samen met iemand anders? Dan kunnen jullie toestellen elkaars lijstjes
      rechtstreeks doorgeven — via bluetooth, zonder internet — en zie je meteen wat
      jullie kunnen ruilen.
    </p>
    <button type="button" class="btn btn--primary" id="ruil-dichtbij-start">
      Zoek iemand in de buurt
    </button>
  `;
  lijsten.parentNode.insertBefore(kaart, lijsten);

  const knop = kaart.querySelector("#ruil-dichtbij-start");
  knop.addEventListener("click", async () => {
    knop.disabled = true;
    knop.textContent = "Bezig met openen…";
    try {
      const module = await import("/js/ruil-dichtbij.js");
      await module.open(kindId);
    } catch (fout) {
      console.error("[ruil-dichtbij] openen mislukt", fout);
      window.alert("Ruil dichtbij kon niet geopend worden: " + (fout?.message || fout));
    } finally {
      knop.disabled = false;
      knop.textContent = "Zoek iemand in de buurt";
    }
  });
}
