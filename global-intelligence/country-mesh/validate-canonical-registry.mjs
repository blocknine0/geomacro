import fs from "node:fs/promises";
const data=JSON.parse(await fs.readFile(new URL("./countries.v1.json",import.meta.url),"utf8"));
const errors=[];
const expected=data.expected_count;
if (!Number.isInteger(expected) || expected < 195) errors.push("expected_count must be an integer >= 195");
if (!Array.isArray(data.countries) || data.countries.length !== expected) errors.push(`countries must contain exactly ${expected} records`);
const iso2=new Set(), iso3=new Set();
for(const c of data.countries ?? []){
  for(const k of ["iso2","iso3","name"]) if(!c[k]) errors.push(`missing ${k} for ${JSON.stringify(c)}`);
  if(c.iso2 && !/^[A-Z]{2}$/.test(c.iso2)) errors.push(`bad ISO2: ${c.iso2}`);
  if(c.iso3 && !/^[A-Z]{3}$/.test(c.iso3)) errors.push(`bad ISO3: ${c.iso3}`);
  if(iso2.has(c.iso2)) errors.push(`duplicate ISO2: ${c.iso2}`);
  if(iso3.has(c.iso3)) errors.push(`duplicate ISO3: ${c.iso3}`);
  iso2.add(c.iso2); iso3.add(c.iso3);
}
if(data.baseline_count !== 195) errors.push("baseline_count must remain 195");
if(errors.length){console.error(errors.join("\n"));process.exit(1);}
console.log(JSON.stringify({status:"PASS",country_universe:data.country_universe,countries:expected,sovereign_baseline:data.baseline_count},null,2));