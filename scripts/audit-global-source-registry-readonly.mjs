#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
const dbUrl=process.env.SUPABASE_DB_URL;
const project=process.env.EXPECTED_SUPABASE_PROJECT_REF;
if(!dbUrl||!project) throw new Error("SUPABASE_DB_URL and EXPECTED_SUPABASE_PROJECT_REF are required");
const exec=promisify(execFile);
const outDir=path.join(process.cwd(),"artifacts","global-source-registry-audit");
await fs.mkdir(outDir,{recursive:true});
async function sql(query){
 const {stdout}=await exec("psql",[dbUrl,"-v","ON_ERROR_STOP=1","-AtF","|","-c",query],{maxBuffer:20*1024*1024});
 return stdout.trimEnd();
}
const checks=[];
const check=(id,pass,observed,required)=>checks.push({id,pass:Boolean(pass),observed,required});
const values=(await sql(`select count(*)::bigint,count(distinct source_id)::bigint,count(*) filter(where base_url is null or btrim(base_url)='')::bigint,count(*) filter(where category not in ('GEOPOLITICS','MACRO','CRITICAL_MINERALS'))::bigint,count(*) filter(where enabled_for_commercial_signals)::bigint,count(*) filter(where enabled_for_commercial_signals and commercial_usage_status<>'COMMERCIAL_OK')::bigint,count(*) filter(where enabled_for_ingestion)::bigint from public.live_external_sources`)).split("|").map(Number);
const [sourceCount,uniqueSourceCount,missingUrls,badCategories,commercialEnabled,commercialRightsMismatch,ingestionEnabled]=values;
check("registry_unique",sourceCount===uniqueSourceCount,{sourceCount,uniqueSourceCount},"all source_id values unique");
check("registry_urls",missingUrls===0,missingUrls,"0 missing base_url");
check("registry_categories",badCategories===0,badCategories,"0 invalid categories");
check("commercial_rights_state",commercialRightsMismatch===0,commercialRightsMismatch,"0 commercially enabled sources without COMMERCIAL_OK");
await fs.writeFile(path.join(outDir,"category-counts.txt"),await sql(`select category,count(*)::bigint from public.live_external_sources group by category order by category`)+"\n");
await fs.writeFile(path.join(outDir,"commercial-status-counts.txt"),await sql(`select commercial_usage_status,count(*)::bigint from public.live_external_sources group by commercial_usage_status order by commercial_usage_status`)+"\n");
await fs.writeFile(path.join(outDir,"enabled-sources.txt"),await sql(`select source_id,category,commercial_usage_status,enabled_for_ingestion,enabled_for_commercial_signals from public.live_external_sources where enabled_for_ingestion or enabled_for_commercial_signals order by source_id`)+"\n");
const queue=(await sql(`select count(*)::bigint,count(*) filter(where certification_state<>'QUEUED')::bigint,count(*) filter(where fail_closed is not true)::bigint,count(*) filter(where endpoint_check<>'PENDING')::bigint,count(*) filter(where rights_check<>'PENDING')::bigint,count(*) filter(where schema_check<>'PENDING')::bigint,count(*) filter(where freshness_check<>'PENDING')::bigint,count(*) filter(where independence_check<>'PENDING')::bigint from public.live_source_certification_queue`)).split("|").map(Number);
check("cert_queue_fail_closed",queue[1]===0&&queue[2]===0,queue,"all certification rows remain QUEUED and fail_closed");
check("cert_queue_pending",queue.slice(3).every(x=>x===0),queue.slice(3),"all certification checks remain PENDING");
for(const [id,query,artifact] of [
 ["critical_minerals_100_view","select * from public.live_critical_minerals_100_status","critical-minerals-status.txt"],
 ["master_inventory_view","select * from public.live_global_source_inventory_100_status","master-inventory-status.txt"]
]){
 try{const output=await sql(query);await fs.writeFile(path.join(outDir,artifact),output+"\n");check(id,true,output,"view exists in production DB")}
 catch(error){check(id,false,String(error?.stderr??error),"view exists in production DB")}
}
const result={evaluated_at:new Date().toISOString(),authoritative_project_ref:project,source_count:sourceCount,unique_source_count:uniqueSourceCount,missing_url_count:missingUrls,invalid_category_count:badCategories,ingestion_enabled_count:ingestionEnabled,commercially_enabled_count:commercialEnabled,commercial_rights_mismatch_count:commercialRightsMismatch,checks,pass:checks.every(x=>x.pass),write_operations_performed:false,limitations:["Read-only production registry audit.","Endpoint reachability is covered by the separate global endpoint probe.","Rights are not inferred from URL reachability.","Adapter schema, freshness semantics and independence require source-specific tests."]};
await fs.writeFile(path.join(outDir,"summary.json"),JSON.stringify(result,null,2));
console.log(JSON.stringify(result,null,2));
if(!result.pass)process.exit(1);
