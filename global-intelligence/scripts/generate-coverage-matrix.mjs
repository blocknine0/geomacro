import fs from "node:fs/promises";

const categories = ["GEOPOLITICS","MACRO","CRITICAL_MINERALS"];
const input = process.env.GEOMACRO_COUNTRIES_FILE
  ? new URL(process.env.GEOMACRO_COUNTRIES_FILE, import.meta.url)
  : new URL("../country-mesh/countries.v1.json", import.meta.url);
const output = new URL("../country-mesh/generated/coverage-matrix.v1.json", import.meta.url);

const raw = JSON.parse(await fs.readFile(input, "utf8"));
const countries = Array.isArray(raw) ? raw : raw.countries;
if (!Array.isArray(countries)) throw new Error("Country list must be an array");

const normalized = countries.map((c) => ({
  iso2: String(c.iso2).toUpperCase(),
  iso3: String(c.iso3).toUpperCase(),
  name: String(c.name),
})).sort((a,b)=>a.iso3.localeCompare(b.iso3));

if (normalized.length !== 195) throw new Error(`Expected 195 countries, got ${normalized.length}`);
if (new Set(normalized.map(c=>c.iso3)).size !== 195) throw new Error("Duplicate ISO3 country");

const cells = normalized.flatMap(country => categories.map(category => ({
  country_iso2: country.iso2,
  country_iso3: country.iso3,
  country_name: country.name,
  category,
  status: "CONFIGURED"
})));

if (cells.length !== 585) throw new Error(`Expected 585 cells, got ${cells.length}`);

await fs.mkdir(new URL("./", output), {recursive:true});
await fs.writeFile(
  output,
  JSON.stringify({version:"1.0", country_count:195, category_count:3, cell_count:585, cells}, null, 2)+"\n"
);
console.log(JSON.stringify({ok:true,country_count:195,cell_count:585,output:output.pathname},null,2));
