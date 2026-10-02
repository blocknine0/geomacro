import { createClient } from "@supabase/supabase-js";

const WINDOWS_SECONDS = {
  GEOPOLITICS: 30 * 60,
  MACRO: 2 * 60 * 60,
  CRITICAL_MINERALS: 4 * 60 * 60,
};

function projectRef(url) {
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
  if(!url||!key) throw new Error("Authoritative Supabase credentials are required");
  if(projectRef(url)!=="ldpwajisioljyjtojvfx") throw new Error("Non-authoritative Supabase project");

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
      .select("country_iso3,category,source_id,transport,last_success_at,discovery_state").eq("enabled",true)
      .order("target_id", {ascending:true}).range(from,from+999);
    if(targetQuery.error) throw targetQuery.error;
    targetRows.push(...(targetQuery.data??[]));
    if((targetQuery.data??[]).length<1000)break;
  }

  const canonicalIso3=resolveCanonicalCountries(directoryQuery.data, registryQuery.data);
  const canonicalSet=new Set(canonicalIso3);
  const targets=targetRows.filter((row)=>canonicalSet.has(normalizeIso(row.country_iso3)));

  const missing=[];
  for(const iso of canonicalIso3) {
    for(const category of Object.keys(WINDOWS_SECONDS)) {
      const rows=(targets??[]).filter(x=>
        normalizeIso(x.country_iso3)===iso&&
        x.category===category&&
        x.last_success_at&&
        x.transport!=="TELEGRAM_DISCOVERY"
      );
      const nonGdeltRows=rows.filter(x=>!/gdelt/i.test(String(x.source_id??"")));
      const window=WINDOWS_SECONDS[category];
      const freshRows=nonGdeltRows.filter(x=>{
        const timestamp=Date.parse(String(x.last_success_at));
        return Number.isFinite(timestamp)&&Date.now()-timestamp<=window*1000;
      });
      if(!freshRows.length) {
        const latest=nonGdeltRows
          .map(x=>Date.parse(String(x.last_success_at)))
          .filter(Number.isFinite)
          .sort((a,b)=>b-a)[0];
        missing.push({
          iso,
          category,
          latest_success_at:Number.isFinite(latest)?new Date(latest).toISOString():null,
          window_seconds:window,
          non_gdelt_candidate_count:nonGdeltRows.length,
        });
      }
    }
  }

  const countryCount=canonicalIso3.length;
  const missingCountries=new Set(missing.map(x=>x.iso)).size;
  const output={
    ok:countryCount>0&&missing.length===0,
    enabled_countries:countryCount,
    expected_country_category_cells:countryCount*Object.keys(WINDOWS_SECONDS).length,
    countries_with_complete_fresh_three_category_runtime:countryCount-missingCountries,
    missing_count:missing.length,
    missing:missing.slice(0,100),
  };
  console.log(JSON.stringify(output,null,2));
  if(!output.ok) process.exit(1);
}

main().catch(e=>{console.error(e instanceof Error?e.stack??e.message:String(e));process.exit(1);});
