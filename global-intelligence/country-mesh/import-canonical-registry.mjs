import fs from "node:fs/promises";
import process from "node:process";

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
if (!url || !key) throw new Error("Set SUPABASE_URL (or VITE_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY/SUPABASE_ANON_KEY.");

const endpoint = new URL("/rest/v1/live_country_registry", url);
endpoint.searchParams.set("select","iso2,iso3,country_name,region,subregion,aliases,demonyms,enabled");
endpoint.searchParams.set("enabled","eq.true");
endpoint.searchParams.set("order","iso3.asc");
endpoint.searchParams.set("limit","500");

const res = await fetch(endpoint, { headers: { apikey:key, Authorization:"Bearer "+key }});
if (!res.ok) throw new Error(`Supabase registry fetch failed: ${res.status} ${await res.text()}`);
const rows = await res.json();
if (!Array.isArray(rows)) throw new Error("Registry response is not an array.");

const countries = rows.map(r => ({
  iso2:r.iso2, iso3:r.iso3, name:r.country_name,
  region:r.region ?? null, subregion:r.subregion ?? null,
  aliases:Array.isArray(r.aliases) ? r.aliases : [],
  demonyms:Array.isArray(r.demonyms) ? r.demonyms : []
}));

const unique = new Set(countries.map(c=>c.iso3));
if (countries.length !== 195 || unique.size !== 195) {
  throw new Error(`Canonical registry gate failed: expected 195 enabled rows, got ${countries.length} rows / ${unique.size} unique ISO3.`);
}

const out = {
  schema_version:"country-mesh-1.0",
  source:"public.live_country_registry",
  generated_at:new Date().toISOString(),
  expected_count:195,
  countries
};
await fs.writeFile(new URL("./countries.v1.json", import.meta.url), JSON.stringify(out,null,2)+"\n");
console.log(`Wrote ${countries.length} canonical countries.`);
