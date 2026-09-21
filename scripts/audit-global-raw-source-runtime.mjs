import { createClient } from "@supabase/supabase-js";

const WINDOWS_SECONDS = {
  GEOPOLITICS: 30 * 60,
  MACRO: 2 * 60 * 60,
  CRITICAL_MINERALS: 4 * 60 * 60,
};

function projectRef(url) {
  try { return new URL(url).hostname.split(".")[0] ?? ""; } catch { return ""; }
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
      .select("country_iso3,category,last_success_at,discovery_state").eq("enabled",true)
      .order("target_id", {ascending:true}).range(from,from+999);
    if(targetQuery.error) throw targetQuery.error;
    targetRows.push(...(targetQuery.data??[]));
    if((targetQuery.data??[]).length<1000)break;
  }
  const registryByIso2=new Map((registryQuery.data??[]).map((x)=>[String(x.iso2).toUpperCase(),String(x.iso3)]));
  const canonicalIso3=[...new Set((directoryQuery.data??[]).map((x)=>registryByIso2.get(String(x.country_iso2).toUpperCase())).filter(Boolean))].sort();
  if(canonicalIso3.length!==195) throw new Error("Canonical 195-country baseline resolution failed: "+canonicalIso3.length);
  const canonicalSet=new Set(canonicalIso3);
  const targets=targetRows.filter((row)=>canonicalSet.has(String(row.country_iso3)));

  const missing=[];
  for(const iso of canonicalIso3) {
    for(const category of Object.keys(WINDOWS_SECONDS)) {
      const rows=(targets??[]).filter(x=>x.country_iso3===iso&&x.category===category&&x.last_success_at);
      const latest=rows.map(x=>Date.parse(String(x.last_success_at))).filter(Number.isFinite).sort((a,b)=>b-a)[0];
      const window=WINDOWS_SECONDS[category];
      if(!Number.isFinite(latest)||Date.now()-latest>window*1000) {
        missing.push({iso,category,latest_success_at:Number.isFinite(latest)?new Date(latest).toISOString():null,window_seconds:window});
      }
    }
  }

  const countryCount=canonicalIso3.length;
  const output={
    ok:countryCount===195&&missing.length===0,
    enabled_countries:countryCount,
    countries_with_complete_fresh_three_category_runtime:195-(new Set(missing.map(x=>x.iso))).size,
    missing_count:missing.length,
    missing:missing.slice(0,100),
  };
  console.log(JSON.stringify(output,null,2));
  if(!output.ok) process.exit(1);
}

main().catch(e=>{console.error(e instanceof Error?e.stack??e.message:String(e));process.exit(1);});
