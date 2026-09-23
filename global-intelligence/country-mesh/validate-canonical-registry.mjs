import fs from "node:fs/promises";
const p = new URL("./countries.v1.json", import.meta.url);
const data = JSON.parse(await fs.readFile(p,"utf8"));
const required = ["iso2","iso3","name"];
const errors=[];
if (data.expected_count !== 195) errors.push("expected_count must be 195");
if (!Array.isArray(data.countries) || data.countries.length !== 195) errors.push("countries must contain exactly 195 records");
const iso2=new Set(), iso3=new Set();
for (const c of data.countries ?? []) {
  for (const k of required) if (!c[k]) errors.push(`missing ${k} for ${JSON.stringify(c)}`);
  if (c.iso2 && !/^[A-Z]{2}$/.test(c.iso2)) errors.push(`bad ISO2: ${c.iso2}`);
  if (c.iso3 && !/^[A-Z]{3}$/.test(c.iso3)) errors.push(`bad ISO3: ${c.iso3}`);
  if (iso2.has(c.iso2)) errors.push(`duplicate ISO2: ${c.iso2}`);
  if (iso3.has(c.iso3)) errors.push(`duplicate ISO3: ${c.iso3}`);
  iso2.add(c.iso2); iso3.add(c.iso3);
}
if (errors.length) { console.error(errors.join("\n")); process.exit(1); }
console.log("Canonical 195-country registry: PASS");
