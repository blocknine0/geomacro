import { createClient } from "@supabase/supabase-js";

const expected = {
  GEOPOLITICS: 3,
  MACRO: 4,
  CRITICAL_MINERALS: 6,
};

function refOf(url) {
  try { return new URL(url).hostname.split(".")[0] ?? ""; } catch { return ""; }
}

async function main() {
  const url=String(process.env.APP_SUPABASE_URL??"").trim();
  const key=String(process.env.APP_SUPABASE_SERVICE_ROLE_KEY??"").trim();
  if (!url || !key) throw new Error("Authoritative Supabase credentials are required");
  if (refOf(url)!=="ldpwajisioljyjtojvfx") throw new Error("Non-authoritative Supabase project");

  const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data: rows,error}=await db.from("live_raw_source_targets")
    .select("target_id,country_iso3,category,transport,enabled")
    .eq("enabled",true);
  if(error) throw error;

  const byCountry=new Map();
  for(const row of rows??[]){
    const iso=String(row.country_iso3);
    const item=byCountry.get(iso)??{GEOPOLITICS:[],MACRO:[],CRITICAL_MINERALS:[]};
    item[row.category].push(row);
    byCountry.set(iso,item);
  }

  const countries=[...byCountry.keys()].sort();
  const missing=[];
  for(const iso of countries){
    for(const category of Object.keys(expected)){
      const count=byCountry.get(iso)?.[category].length??0;
      if(count<expected[category]) missing.push({iso,category,expected:expected[category],actual:count});
    }
  }

  const output={
    ok: countries.length===195 && missing.length===0,
    countries:countries.length,
    expected_targets_per_country:expected,
    expected_total_targets:195*(3+4+6),
    actual_total_targets:(rows??[]).length,
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
