#!/usr/bin/env node
/** Read-only daily Risk Stream / Predge coverage and throughput report. */
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {pathToFileURL} from "node:url";
import {checkD1PaidMonthlyHeadroom} from "../lib/d1-workers-paid-monthly-governor.mjs";

const DATABASE_ID="db057ca9-9f6e-4957-ac28-144f3b798f9b";
const CATEGORIES=["GEOPOLITICS","MACRO_FX","CRITICAL_MINERALS"];
const TIERS=["basic_focused","standard","complex_full"];
const AUDIT_INDEXES=["idx_risk_stream_signed_gro_created_category_country",
 "idx_risk_stream_predge_pull_created_category_country",
 "idx_predge_paid_usage_created_tier_delivery"];
const fail=code=>{throw Error("HOT50_DAILY_AUDIT_"+code)};
const dayValid=day=>typeof day==="string"&&/^\d{4}-\d{2}-\d{2}$/u.test(day)&&
 Number.isFinite(Date.parse(day+"T00:00:00.000Z"))&&
 new Date(day+"T00:00:00.000Z").toISOString().slice(0,10)===day;

export function summarizeHot50DailyRows(rows,{day,countries,manifestEntries=[]}={}){
 if(!dayValid(day)||!Array.isArray(countries)||countries.length!==50||
    new Set(countries).size!==50||countries.some(x=>! /^[A-Z]{3}$/u.test(x))||
    !Array.isArray(rows))fail("INPUT_INVALID");
 const counts=new Map();
 for(const row of rows){
  if(!["gro_category","license_category","paid_tier","hot50_country_category","registry_source"].includes(row?.kind)||
     typeof row.dimension!=="string"||!Number.isSafeInteger(row.count)||row.count<0||
     (row.kind==="hot50_country_category"&&!countries.includes(row.country_iso3))||
     (row.kind==="registry_source"&&(![0,1].includes(row.approved)||typeof row.source_role!=="string")))
   fail("ROW_INVALID");
  counts.set(row.kind+"\0"+row.dimension+(row.country_iso3?"\0"+row.country_iso3:""),row);
 }
 const categoryCounts=Object.fromEntries(CATEGORIES.map(category=>[category,{
  signed_gros:counts.get("gro_category\0"+category)?.count??0,
  pull_licenses:counts.get("license_category\0"+category)?.count??0
 }]));
 const tierCounts=Object.fromEntries(TIERS.map(tier=>[tier,counts.get("paid_tier\0"+tier)?.count??0]));
 const countryCoverage=Object.fromEntries(CATEGORIES.map(category=>{
  const active=countries.filter(country=>(counts.get("hot50_country_category\0"+category+"\0"+country)?.count??0)>0);
  return [category,{countries_with_signed_gro:active.length,country_count:50,
    coverage:`${active.length}/50`,country_iso3:active}];
 }));
 // A signed item count alone cannot certify a sellable country/category cell:
 // item-level rights, freshness, independent-source roles and historical
 // Complex rollups must be checked by the protected qualification engine.
 // Nevertheless, enumerate ALL 50 x 3 cells every UTC day, including zeros;
 // no country or category silently disappears from the operational audit.
 const dailyCells=countries.flatMap(country_iso3=>CATEGORIES.map(category=>{
  const count=counts.get("hot50_country_category\0"+category+"\0"+country_iso3)?.count??0;
  return {country_iso3,category,signed_gros_today:count,
   status:count>0?"SIGNED_OBSERVATION_NEEDS_ITEM_QUALIFICATION":"NO_SIGNED_OBSERVATION_TODAY",
   commercial_rights_approved:false,independent_corroboration_verified:false,
   billable_readiness_verified:false};
 }));
 const dailyMatrix={expected_cells:150,observed_cells:dailyCells.length,
  signed_observation_cells:dailyCells.filter(c=>c.signed_gros_today>0).length,
  no_signed_observation_cells:dailyCells.filter(c=>c.signed_gros_today===0).length,
  commercial_ready_cells_unproven:dailyCells.length,
  no_fabricated_news_or_automatic_rights_approval:true,cells:dailyCells};
 const registryRows=new Map(rows.filter(x=>x.kind==="registry_source").map(x=>[x.dimension,x]));
 const sourceRegistry=Object.fromEntries(CATEGORIES.map(category=>{
  const scoped=manifestEntries.filter(x=>x.status==="APPROVED"&&x.categories?.includes(category));
  const missing=scoped.filter(x=>!registryRows.has(x.source_id)).map(x=>x.source_id);
  const disabled=scoped.filter(x=>registryRows.has(x.source_id)&&registryRows.get(x.source_id).count!==1).map(x=>x.source_id);
  const unapproved=scoped.filter(x=>registryRows.has(x.source_id)&&registryRows.get(x.source_id).approved!==1).map(x=>x.source_id);
  const roleMismatch=scoped.filter(x=>registryRows.has(x.source_id)&&registryRows.get(x.source_id).source_role!==x.source_role).map(x=>x.source_id);
  return [category,{reviewed_source_count:scoped.length,
   enabled_reviewed_source_count:scoped.filter(x=>registryRows.get(x.source_id)?.count===1&&registryRows.get(x.source_id)?.approved===1&&registryRows.get(x.source_id)?.source_role===x.source_role).length,
   missing_source_ids:missing,disabled_source_ids:disabled,
   rights_unapproved_source_ids:unapproved,role_mismatch_source_ids:roleMismatch}];
 }));
 return {schema:"geomacro.hot50-risk-stream-daily-audit.v1",day_utc:day,
  scope:"READ_ONLY_DAILY_COUNTS_NO_PUBLIC_ROUTE_CHANGES",category_counts:categoryCounts,
  paid_tier_deliveries:tierCounts,hot50_country_coverage:countryCoverage,
  hot50_daily_150_cell_matrix:dailyMatrix,reviewed_source_registry:sourceRegistry,
  billable_deliveries_are_recorded_by_tier_only:true,
  category_and_tier_cross_tab_available:false,
  payment_activation_authorized:false};
}

function buildQuery(countryCount,reviewedSourceCount){
 const dates="created_at >= ? AND created_at < ?";
 const inCountries=Array.from({length:countryCount},()=>"?").join(",");
 const inSources=Array.from({length:reviewedSourceCount},()=>"?").join(",");
 return [
  `SELECT 'gro_category' AS kind,category AS dimension,COUNT(*) AS count,NULL AS country_iso3,NULL AS source_role,NULL AS approved FROM risk_stream_signed_gro WHERE ${dates} GROUP BY category`,
  `SELECT 'license_category' AS kind,category AS dimension,COUNT(*) AS count,NULL AS country_iso3,NULL AS source_role,NULL AS approved FROM risk_stream_predge_pull_licenses WHERE ${dates} GROUP BY category`,
  `SELECT 'paid_tier' AS kind,tier AS dimension,COUNT(*) AS count,NULL AS country_iso3,NULL AS source_role,NULL AS approved FROM predge_paid_risk_gate_usage_ledger WHERE ${dates} AND entry_status='DELIVERED' AND billable=1 GROUP BY tier`,
  `SELECT 'hot50_country_category' AS kind,category AS dimension,COUNT(*) AS count,country_iso3,NULL AS source_role,NULL AS approved FROM risk_stream_signed_gro WHERE ${dates} AND country_iso3 IN (${inCountries}) GROUP BY category,country_iso3`,
  `SELECT 'registry_source' AS kind,source_id AS dimension,enabled AS count,NULL AS country_iso3,source_role,commercial_rights_approved AS approved FROM risk_stream_sources WHERE source_id IN (${inSources})`
 ].join(" UNION ALL ");
}

export async function readHot50RiskStreamDailyAudit({env=process.env,now=new Date(),
 fetchImpl=fetch,headroomCheck=checkD1PaidMonthlyHeadroom,hot50ConfigPath,
 skipHeadroom=false}={}){
 const account=env.CLOUDFLARE_ACCOUNT_ID,token=env.CLOUDFLARE_API_TOKEN;
 if(!/^[a-f0-9]{32}$/iu.test(account??"")||typeof token!=="string"||token.length<20)
  fail("CLOUDFLARE_AUTH_MISSING");
 const configPath=hot50ConfigPath??resolve("config/hot-50-three-domain-watch.v1.json");
 let watch,rights;try{
  watch=JSON.parse(readFileSync(configPath,"utf8"));
  rights=JSON.parse(readFileSync(resolve("config/risk-stream-source-rights-reviewed.v1.json"),"utf8"));
 }catch{fail("CONFIG_INVALID")}
 const countries=watch?.country_iso3;
 if(!Array.isArray(countries)||countries.length!==50||new Set(countries).size!==50)
  fail("HOT50_COUNTRY_SET_INVALID");
 if(rights?.schema!=="geomacro.risk-stream-source-rights-reviewed.v1"||!Array.isArray(rights.entries))
  fail("RIGHTS_MANIFEST_INVALID");
 if(!skipHeadroom){
  const proof=await headroomCheck({env,fetchImpl,now,lane:"research"});
  if(proof?.status!=="PASS"||proof?.no_d1_sql_or_write_issued!==true)
   fail("MONTHLY_HEADROOM_UNVERIFIED");
 }
 const day=now.toISOString().slice(0,10),start=day+"T00:00:00.000Z";
 const end=new Date(Date.parse(start)+86_400_000).toISOString();
 const params=[];
 for(let i=0;i<3;i++)params.push(start,end);
 params.push(start,end,...countries,...rights.entries.filter(x=>x.status==="APPROVED").map(x=>x.source_id));
 const endpoint=`https://api.cloudflare.com/client/v4/accounts/${account}/d1/database/${DATABASE_ID}/query`;
 const query=async(sql,queryParams=[])=>{
  let response;
  try{response=await fetchImpl(endpoint,{method:"POST",redirect:"error",
   signal:AbortSignal.timeout(15000),headers:{Authorization:"Bearer "+token,
    "Content-Type":"application/json"},body:JSON.stringify({sql,params:queryParams})})}
  catch{fail("D1_PROVIDER_UNAVAILABLE")}
  if(response?.status!==200)fail("D1_PROVIDER_HTTP_NOT_OK");
  let body;try{body=await response.json()}catch{fail("D1_RESPONSE_INVALID")}
  if(body?.success!==true||!Array.isArray(body.result)||body.result.length!==1||
     !Array.isArray(body.result[0]?.results))fail("D1_RESPONSE_SHAPE_INVALID");
  return body.result[0].results;
 };
 const indexes=await query("SELECT name FROM sqlite_schema WHERE type='index' AND name IN ("+
  AUDIT_INDEXES.map(()=>"?").join(",")+")",AUDIT_INDEXES);
 if(!AUDIT_INDEXES.every(name=>indexes.some(row=>row.name===name)))
  fail("AUDIT_INDEX_MIGRATION_NOT_APPLIED");
 const rows=await query(buildQuery(countries.length,
  rights.entries.filter(x=>x.status==="APPROVED").length),params);
 return summarizeHot50DailyRows(rows,{day,countries,
  manifestEntries:rights.entries});
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 try{process.stdout.write(JSON.stringify(await readHot50RiskStreamDailyAudit(),null,2)+"\n")}
 catch(error){process.stderr.write(String(error?.message??"HOT50_DAILY_AUDIT_FAILED").slice(0,120)+"\n");process.exitCode=2}
}
