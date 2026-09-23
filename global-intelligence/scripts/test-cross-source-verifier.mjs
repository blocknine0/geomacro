import assert from "node:assert/strict";
import {verifyObservations} from "../engine/cross-source-verifier.mjs";

const base = {
  country_iso3: "USA",
  category: "GEOPOLITICS",
  title: "Example security development",
  summary: "Example security development affects the country."
};

const twoTrusted = verifyObservations([
  {...base, source_id:"GDELT"},
  {...base, source_id:"UNSC"}
]);
assert.equal(twoTrusted.length, 1);
assert.equal(twoTrusted[0].verified, true);
assert.equal(twoTrusted[0].corroborated, true);
assert.equal(twoTrusted[0].independent_source_count, 2);

const oneEarlyTelegram = verifyObservations([
  {...base, source_id:"TELEGRAM_EARLY_SIGNAL:channel-a"},
  {...base, source_id:"TELEGRAM_EARLY_SIGNAL:channel-b"}
]);
assert.equal(oneEarlyTelegram[0].verified, false);
assert.equal(oneEarlyTelegram[0].corroborated, true);
assert.equal(oneEarlyTelegram[0].telegram_only, true);

const verifiedTelegram = verifyObservations([
  {...base, source_id:"TELEGRAM:official-channel", source_class:"TELEGRAM_VERIFIED"}
]);
assert.equal(verifiedTelegram[0].verified, true);
assert.equal(verifiedTelegram[0].authoritative_telegram_source_count, 1);

const mixed = verifyObservations([
  {...base, source_id:"TELEGRAM_EARLY_SIGNAL:a"},
  {...base, source_id:"GDELT"}
]);
assert.equal(mixed[0].verified, false);
assert.equal(mixed[0].corroborated, true);

console.log("PASS cross-source verifier");
