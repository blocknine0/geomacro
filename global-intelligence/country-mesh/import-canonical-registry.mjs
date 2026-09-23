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
  iso2:String(r.iso2).toUpperCase(),
  iso3:String(r.iso3).toUpperCase(),
  name:r.country_name,
  region:r.region ?? null,
  subregion:r.subregion ?? null,
  aliases:Array.isArray(r.aliases) ? r.aliases : [],
  demonyms:Array.isArray(r.demonyms) ? r.demonyms : []
}));

const iso2 = new Set(countries.map(c=>c.iso2));
const iso3 = new Set(countries.map(c=>c.iso3));
if (countries.length < 195) {
  throw new Error(`Global country universe gate failed: expected at least 195 enabled countries, got ${countries.length}.`);
}
if (iso2.size !== countries.length || iso3.size !== countries.length) {
  throw new Error("Global country universe gate failed: duplicate ISO2 or ISO3.");
}
for (const c of countries) {
  if (!/^[A-Z]{2}$/.test(c.iso2) || !/^[A-Z]{3}$/.test(c.iso3) || !c.name) {
    throw new Error(`Global country universe contains invalid record: ${JSON.stringify(c)}`);
  }
}

const primaryDirectory = new URL("/rest/v1/live_country_primary_source_directory", url);
primaryDirectory.searchParams.set("select","country_iso2");
primaryDirectory.searchParams.set("order","country_iso2.asc");
primaryDirectory.searchParams.set("limit","500");
const primaryRes = await fetch(primaryDirectory, { headers: { apikey:key, Authorization:"Bearer "+key }});
if (!primaryRes.ok) throw new Error(`Supabase primary-source directory fetch failed: ${primaryRes.status} ${await primaryRes.text()}`);
const primaryRows = await primaryRes.json();
const primaryIso2 = new Set((primaryRows ?? []).map(r=>String(r.country_iso2 ?? "").toUpperCase()).filter(Boolean));
if (primaryIso2.size !== 195) {
  throw new Error(`Governed sovereign baseline gate failed: expected 195 primary-source countries, got ${primaryIso2.size}.`);
}

const out = {
  schema_version:"country-mesh-1.1",
  source:"public.live_country_registry",
  generated_at:new Date().toISOString(),
  baseline_count:195,
  expected_count:countries.length,
  country_universe:"all_enabled_registry_countries",
  primary_source_baseline_count:primaryIso2.size,
  countries
};
await fs.writeFile(new URL("./countries.v1.json", import.meta.url), JSON.stringify(out,null,2)+"\n");
console.log(JSON.stringify({ok:true,country_count:countries.length,sovereign_baseline:primaryIso2.size},null,2));