import fs from "node:fs/promises";
import assert from "node:assert/strict";
import {normalizeCountryIso3} from "../adapters/mineral-normalization.mjs";

const p=new URL("./countries.v1.json",import.meta.url);
const data=JSON.parse(await fs.readFile(p,"utf8"));
assert.equal(data.expected_count,195);
assert.equal(data.countries.length,195);
const canonical=new Set(data.countries.map(c=>c.iso3));

const sample=["USA","CHN","IND","DEU","GBR","COD"];
for(const iso3 of sample) assert.equal(normalizeCountryIso3(iso3,{canonicalIso3Set:canonical}),iso3);

const unknown=normalizeCountryIso3("Atlantis",{canonicalIso3Set:canonical});
assert.equal(unknown,null);

console.log(JSON.stringify({status:"PASS",canonical_country_count:canonical.size,sample_checked:sample.length},null,2));
