// Tests voor het uitwisselprotocol van "Ruil dichtbij".
//
// Draait met de ingebouwde testloper van Node (node --test), zonder extra
// afhankelijkheden. Dat is hier geen zuinigheid maar een principe: de native
// laag (Swift/Java) kan op een Windows-machine niet gecompileerd worden, dus
// alles wat wél te controleren valt, moet ook echt gecontroleerd worden.
//
// Gebruik: npm test
import test from "node:test";
import assert from "node:assert/strict";

import { maakPakket, leesPakket, vergelijk, PROTOCOL_VERSIE } from "../web-overlay/js/ruil-protocol.js";

// --- maakPakket ------------------------------------------------------------

test("maakPakket splitst zoeken en dubbels uit de databankrijen", () => {
  const pakket = maakPakket("Fien", [
    { nummer: "BEL7", status: "ZOEKT", aantal: 1 },
    { nummer: "FRA10", status: "ZOEKT", aantal: 1 },
    { nummer: "BEL9", status: "RUILT", aantal: 3 },
  ]);

  assert.equal(pakket.v, PROTOCOL_VERSIE);
  assert.equal(pakket.naam, "Fien");
  assert.deepEqual(pakket.zoekt, ["BEL7", "FRA10"]);
  assert.deepEqual(pakket.dubbel, { BEL9: 3 });
});

test("maakPakket rekent een ontbrekend of onmogelijk aantal om naar 1", () => {
  const pakket = maakPakket("Jan", [
    { nummer: "MEX3", status: "RUILT" },
    { nummer: "MEX4", status: "RUILT", aantal: 0 },
    { nummer: "MEX5", status: "RUILT", aantal: -2 },
  ]);
  assert.deepEqual(pakket.dubbel, { MEX3: 1, MEX4: 1, MEX5: 1 });
});

// --- leesPakket ------------------------------------------------------------

test("leesPakket leest terug wat maakPakket verstuurt", () => {
  const heen = maakPakket("Fien", [
    { nummer: "BEL7", status: "ZOEKT" },
    { nummer: "BEL9", status: "RUILT", aantal: 2 },
  ]);
  const terug = leesPakket(JSON.stringify(heen));
  assert.deepEqual(terug, heen);
});

test("leesPakket weigert onleesbare tekst", () => {
  assert.throws(() => leesPakket("geen json"), /onleesbaar/);
  assert.throws(() => leesPakket("[1,2,3]"), /onleesbaar/);
  assert.throws(() => leesPakket("null"), /onleesbaar/);
});

test("leesPakket noemt een versieverschil bij naam", () => {
  const oud = JSON.stringify({ v: 99, naam: "Jan", zoekt: [], dubbel: {} });
  assert.throws(() => leesPakket(oud), /versie 99/);
  assert.throws(() => leesPakket(oud), /bij/i);
});

test("leesPakket weigert een pakket zonder lijsten", () => {
  assert.throws(
    () => leesPakket(JSON.stringify({ v: PROTOCOL_VERSIE, naam: "Jan" })),
    /zoek- of dubbellijst/
  );
});

test("leesPakket gooit rommel uit de lijsten en vult een lege naam aan", () => {
  const vies = JSON.stringify({
    v: PROTOCOL_VERSIE,
    naam: "   ",
    zoekt: ["BEL7", 42, null, "FRA10"],
    dubbel: { BEL9: "2", MEX3: "veel", MEX4: 2.7 },
  });
  const schoon = leesPakket(vies);
  assert.equal(schoon.naam, "Onbekend");
  assert.deepEqual(schoon.zoekt, ["BEL7", "FRA10"]);
  assert.deepEqual(schoon.dubbel, { BEL9: 2, MEX4: 2 });
});

// --- vergelijk -------------------------------------------------------------

test("vergelijk vindt beide richtingen en houdt de juiste aantallen", () => {
  const mij = { naam: "Fien", zoekt: ["MEX3", "BEL7"], dubbel: { BEL9: 3, FRA10: 1 } };
  const ander = { naam: "Jan", zoekt: ["BEL9"], dubbel: { MEX3: 5, ARG1: 2 } };

  const { ikGeef, ikKrijg } = vergelijk(mij, ander);

  // Ik geef uit MIJN voorraad, dus met MIJN aantal.
  assert.deepEqual(ikGeef, [{ code: "BEL9", aantal: 3 }]);
  // Ik krijg uit ZIJN voorraad, dus met ZIJN aantal.
  assert.deepEqual(ikKrijg, [{ code: "MEX3", aantal: 5 }]);
});

test("vergelijk sorteert op code zodat de lijst voorspelbaar staat", () => {
  const mij = { naam: "Fien", zoekt: [], dubbel: { MEX3: 1, ARG1: 1, BEL9: 1 } };
  const ander = { naam: "Jan", zoekt: ["MEX3", "ARG1", "BEL9"], dubbel: {} };
  assert.deepEqual(
    vergelijk(mij, ander).ikGeef.map((r) => r.code),
    ["ARG1", "BEL9", "MEX3"]
  );
});

test("vergelijk geeft lege lijsten als er niets past", () => {
  const mij = { naam: "Fien", zoekt: ["AAA1"], dubbel: { BBB2: 1 } };
  const ander = { naam: "Jan", zoekt: ["CCC3"], dubbel: { DDD4: 1 } };
  assert.deepEqual(vergelijk(mij, ander), { ikGeef: [], ikKrijg: [] });
});

test("vergelijk trapt niet in geërfde eigenschappen van Object", () => {
  // Zonder eigen-eigenschapcontrole zou "constructor" als match tellen, want
  // elk object erft die van Object.prototype.
  const mij = { naam: "Fien", zoekt: ["constructor", "toString"], dubbel: {} };
  const ander = { naam: "Jan", zoekt: [], dubbel: {} };
  assert.deepEqual(vergelijk(mij, ander).ikKrijg, []);
});

// --- de hele keten ---------------------------------------------------------

test("volledige uitwisseling tussen twee kinderen", () => {
  const fien = maakPakket("Fien", [
    { nummer: "BEL7", status: "ZOEKT" },
    { nummer: "MEX3", status: "ZOEKT" },
    { nummer: "BEL9", status: "RUILT", aantal: 2 },
  ]);
  const jan = maakPakket("Jan", [
    { nummer: "BEL9", status: "ZOEKT" },
    { nummer: "MEX3", status: "RUILT", aantal: 4 },
  ]);

  // Zoals het echt gaat: over de lijn als tekst, en aan de andere kant gelezen.
  const janBijFien = leesPakket(JSON.stringify(jan));
  const fienBijJan = leesPakket(JSON.stringify(fien));

  const bijFien = vergelijk(fien, janBijFien);
  const bijJan = vergelijk(jan, fienBijJan);

  assert.deepEqual(bijFien.ikGeef, [{ code: "BEL9", aantal: 2 }]);
  assert.deepEqual(bijFien.ikKrijg, [{ code: "MEX3", aantal: 4 }]);

  // Beide toestellen moeten hetzelfde zien, maar dan omgekeerd — anders denkt
  // het ene kind dat het iets krijgt wat het andere niet meent te geven.
  assert.deepEqual(bijJan.ikKrijg, bijFien.ikGeef);
  assert.deepEqual(bijJan.ikGeef, bijFien.ikKrijg);
});
