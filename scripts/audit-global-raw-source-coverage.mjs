import { createClient } from "@supabase/supabase-js";

const expected = {
  GEOPOLITICS: 3,
  MACRO: 4,
  CRITICAL_MINERALS: 6,
};

function refOf(url) {
  try { return new URL(url).hostname.split(".")[0] ?? ""; } catch { return ""; }
}

function normalizeIso(value) {
  return String(value ?? "").trim().toUpperCase();
}

function resolveCanonicalCountries(directoryRows, registryRows) {
  const registryEntries = (registryRows ?? [])
    .map((row) => [normalizeIso(row.iso2), normalizeIso(row.iso3)])
    .filter(([iso2, iso3]) => iso2 && iso3);
  const registryIso2 = registryEntries.map(([iso2]) => iso2);
  if (new Set(registryIso2).size !== registryIso2.length) {
    throw new Error("Canonical enabled registry contains duplicate ISO2 entries");
  }

  const normalizedDirectory = (directoryRows ?? [])
    .map((row) => normalizeIso(row.country_iso2))
    .filter(Boolean);
  const directoryIso2 = [...new Set(normalizedDirectory)].sort();
  if (!directoryIso2.length) {
    throw new Error("Canonical country source directory is empty");
  }
  if (directoryIso2.length !== normalizedDirectory.length) {
    throw new Error("Canonical country source directory contains duplicate ISO2 entries");
  }

  const registryByIso2 = new Map(registryEntries);
  const unmappedDirectoryIso2 = directoryIso2.filter((iso2) => !registryByIso2.has(iso2));
  if (unmappedDirectoryIso2.length) {
    throw new Error(
      "Canonical country source directory has entries missing from the enabled registry: " +
        unmappedDirectoryIso2.join(","),
    );
  }

  const canonicalIso3 = directoryIso2.map((iso2) => registryByIso2.get(iso2));
  if (new Set(canonicalIso3).size !== canonicalIso3.length) {
    throw new Error("Canonical country resolution produced duplicate ISO3 entries");
  }

  return canonicalIso3.sort();
}

async function main() {
  const url=String(process.env.APP_SUPABASE_URL??"").trim();
  const key=String(process.env.APP_SUPABASE_SERVICE_ROLE_KEY??"").trim();
  if (!url || !key) throw new Error("Authoritative Supabase credentials are required");
  if (refOf(url)!=="ldpwajisioljyjtojvfx") throw new Error("Non-authoritative Supabase project");

  const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  const [directoryQuery, registryQuery] = await Promise.all([
    db.from("live_country_primary_source_directory").select("country_iso2").order("country_iso2", { ascending: true }),
    db.from("live_country_registry").select("iso3,iso2").eq("enabled", true),
  ]);
  if(directoryQuery.error) throw directoryQuery.error;
  if(registryQuery.error) throw registryQuery.error;
  const targetRows=[];
  for(let from=0;;from+=1000){
    const targetQuery=await db.from("live_raw_source_targets")
      .select("target_id,country_iso3,category,transport,enabled").eq("enabled",true)
      .order("target_id", {ascending:true}).range(from,from+999);
    if(targetQuery.error) throw targetQuery.error;
    targetRows.push(...(targetQuery.data??[]));
    if((targetQuery.data??[]).length<1000)break;
  }

  const canonicalIso3=resolveCanonicalCountries(directoryQuery.data, registryQuery.data);
  const canonicalSet=new Set(canonicalIso3);
  const rows=targetRows.filter((row)=>canonicalSet.has(normalizeIso(row.country_iso3)));

  const byCountry=new Map();
  for(const row of rows??[]){
    const iso=normalizeIso(row.country_iso3);
    const item=byCountry.get(iso)??{GEOPOLITICS:[],MACRO:[],CRITICAL_MINERALS:[]};
    if (!Object.prototype.hasOwnProperty.call(item, row.category)) continue;
    item[row.category].push(row);
    byCountry.set(iso,item);
  }

  const countries=canonicalIso3.slice().sort();
  const missing=[];
  for(const iso of countries){
    for(const category of Object.keys(expected)){
      const count=byCountry.get(iso)?.[category].length??0;
      if(count<expected[category]) missing.push({iso,category,expected:expected[category],actual:count});
    }
  }

  const targetsPerCountry=Object.values(expected).reduce((sum,count)=>sum+count,0);
  const output={
    ok: countries.length>0 && missing.length===0,
    countries:countries.length,
    expected_targets_per_country:expected,
    expected_total_targets:countries.length*targetsPerCountry,
    actual_total_targets:rows.length,
    countries_with_complete_three_category_mesh: countries.filter((iso)=>{
      const x=byCountry.get(iso);
      return Object.keys(expected).every((c)=>x?.[c].length>=expected[c]);
    }).length,
    missing,
  };
  console.log(JSON.stringify(output,null,2));
  if(!output.ok) process.exit(1);
}

main().catch((e)=>{console.error(e instanceof Error?e.stack??e.message:String(e));process.exit(1);});
