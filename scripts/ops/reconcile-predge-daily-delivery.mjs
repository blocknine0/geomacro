#!/usr/bin/env node
/** Read-only UTC daily Risk Gate and Predge delivery reconciliation. */
import {mkdirSync,readFileSync,writeFileSync} from "node:fs";
import {basename,resolve} from "node:path";
import {pathToFileURL} from "node:url";

const DATABASE_ID="db057ca9-9f6e-4957-ac28-144f3b798f9b";
const CATEGORIES=new Set(["GEOPOLITICS","MACRO_FX","CRITICAL_MINERALS"]);
const TIER_MAP=Object.freeze({basic_focused:"BASIC",BASIC:"BASIC",
 standard:"STANDARD",STANDARD:"STANDARD",complex_full:"COMPLEX",COMPLEX:"COMPLEX"});
const PRICE=Object.freeze({BASIC:{customer:0.15,net:0.10,fee:0.05},
 STANDARD:{customer:0.20,net:0.15,fee:0.05},
 COMPLEX:{customer:0.30,net:0.25,fee:0.05}});
const fail=code=>{throw Error("PREDGE_DAILY_RECONCILIATION_"+code)};
const validDay=day=>typeof day==="string"&&/^\d{4}-\d{2}-\d{2}$/u.test(day)&&
 Number.isFinite(Date.parse(day+"T00:00:00.000Z"))&&
 new Date(day+"T00:00:00.000Z").toISOString().slice(0,10)===day;

function groTiers(row){
 let payload={};
 try{payload=JSON.parse(row.payload_json??"{}")}catch{fail("GRO_PAYLOAD_INVALID")}
 const candidates=Array.isArray(payload.eligible_tiers)?payload.eligible_tiers:
  [payload.tier??payload.primary_tier??"UNSPECIFIED"];
 const tiers=[...new Set(candidates.map(x=>TIER_MAP[x]??"UNSPECIFIED"))];
 return tiers.length?tiers:["UNSPECIFIED"];
}
function requireRows(rows,field){
 if(!Array.isArray(rows))fail("ROWS_INVALID");
 for(const row of rows){
  if(!row||typeof row!=="object"||!CATEGORIES.has(row.category)||
    !/^[A-Z]{3}$/u.test(String(row.country_iso3??""))||
    !Number.isFinite(Date.parse(row.created_at??row.day_utc??"")))
   fail(field+"_ROW_INVALID");
 }
}

export function aggregatePredgeDailyLedger(createdRows,deliveryRows,{day}={}){
 if(!validDay(day))fail("DAY_INVALID");
 requireRows(createdRows,"CREATED");
 if(!Array.isArray(deliveryRows))fail("DELIVERY_ROWS_INVALID");
 const createdIds=new Set(),createdGroups=new Map(),createdTier=new Map();
 for(const row of createdRows){
  if(new Date(Date.parse(row.created_at)).toISOString().slice(0,10)!==day)continue;
  if(typeof row.gro_id!=="string"||!row.gro_id)fail("GRO_ID_INVALID");
  createdIds.add(row.gro_id);
  const cell=row.country_iso3+"|"+row.category;
  createdGroups.set(cell,(createdGroups.get(cell)??0)+1);
  for(const tier of groTiers(row)){
   const key=row.country_iso3+"|"+row.category+"|"+tier;
   createdTier.set(key,(createdTier.get(key)??0)+1);
  }
 }
 const byTier=Object.fromEntries(["BASIC","STANDARD","COMPLEX","UNSPECIFIED"].map(tier=>[tier,{
  created:0,sent:0,delivered:0,failed:0,customer_price_usd:PRICE[tier]?.customer??0,
  geomacro_net_usd:PRICE[tier]?.net??0,predge_fee_usd:PRICE[tier]?.fee??0
 }]));
 for(const [key,count] of createdTier){
  const tier=key.slice(key.lastIndexOf("|")+1);
  byTier[tier].created+=count;
 }
 const deliveries=deliveryRows.filter(row=>row.day_utc===day);
 const deliveryCells=new Map();
 for(const row of deliveries){
  if(!CATEGORIES.has(row.category)||!/^[A-Z]{3}$/u.test(String(row.country_iso3??""))||
     !Object.hasOwn(byTier,row.tier)||!["SENT","DELIVERED","FAILED"].includes(row.delivery_status)||
     !/^[a-f0-9]{64}$/u.test(String(row.receipt_sha256??"")))
   fail("DELIVERY_ROW_INVALID");
  if(row.delivery_status==="SENT"||row.delivery_status==="DELIVERED")byTier[row.tier].sent+=1;
  if(row.delivery_status==="DELIVERED")byTier[row.tier].delivered+=1;
  if(row.delivery_status==="FAILED")byTier[row.tier].failed+=1;
  const cellKey=row.country_iso3+"|"+row.category+"|"+row.tier;
  const cell=deliveryCells.get(cellKey)??{sent:0,delivered:0,failed:0,expected_net_cents:0};
  if(row.delivery_status==="SENT"||row.delivery_status==="DELIVERED")cell.sent+=1;
  if(row.delivery_status==="DELIVERED"){
   const cents=Math.round(Number(row.geomacro_net_usd)*100);
   if(!Number.isFinite(Number(row.geomacro_net_usd)))fail("NET_AMOUNT_INVALID");
   cell.delivered+=1;cell.expected_net_cents+=cents;
  }
  if(row.delivery_status==="FAILED")cell.failed+=1;
  deliveryCells.set(cellKey,cell);
 }
 const sent=deliveries.filter(x=>x.delivery_status==="SENT"||x.delivery_status==="DELIVERED");
 const delivered=deliveries.filter(x=>x.delivery_status==="DELIVERED");
 const failed=deliveries.filter(x=>x.delivery_status==="FAILED");
 const expectedNetCents=delivered.reduce((sum,row)=>sum+Math.round(Number(row.geomacro_net_usd)*100),0);
 if(delivered.some(row=>!Number.isFinite(Number(row.geomacro_net_usd))))fail("NET_AMOUNT_INVALID");
 const countryCategory=[...createdGroups.entries()].map(([key,count])=>{
  const [country_iso3,category]=key.split("|");
  return {country_iso3,category,created_total:count};
 }).sort((a,b)=>a.country_iso3.localeCompare(b.country_iso3)||a.category.localeCompare(b.category));
 const tierByCell=[...createdTier.entries()].map(([key,count])=>{
  const [country_iso3,category,tier]=key.split("|");
  return {country_iso3,category,tier,created_total:count};
 }).sort((a,b)=>a.country_iso3.localeCompare(b.country_iso3)||
  a.category.localeCompare(b.category)||a.tier.localeCompare(b.tier));
 return {schema:"geomacro.predge-daily-delivery-reconciliation.v1",day_utc:day,
  created_total:createdIds.size,sent_to_predge_total:sent.length,
  delivered_total:delivered.length,failed_total:failed.length,
  created_by_tier:Object.fromEntries(Object.entries(byTier).map(([tier,value])=>[tier,value.created])),
  delivery_by_tier:byTier,created_by_country_category:countryCategory,
  created_by_country_category_tier:tierByCell,
  delivery_by_country_category_tier:[...deliveryCells.entries()].map(([key,value])=>{
   const [country_iso3,category,tier]=key.split("|");
   return {country_iso3,category,tier,...value,
    expected_geomacro_net_usd:(value.expected_net_cents/100).toFixed(2)};
  }).sort((a,b)=>a.country_iso3.localeCompare(b.country_iso3)||
   a.category.localeCompare(b.category)||a.tier.localeCompare(b.tier)),
  expected_geomacro_net_usd:(expectedNetCents/100).toFixed(2),
  reconciliation: null};
}

function csvCell(value){
 const text=String(value??"");
 return /[",\r\n]/u.test(text)?'"'+text.replace(/"/gu,'""')+'"':text;
}
export function renderPredgeDailyCsv(report){
 const rows=[["day_utc","country_iso3","category","tier","created_total",
  "sent_to_predge_total","delivered_total","failed_total","customer_price_usd",
  "expected_geomacro_net_usd","predge_fee_usd"]];
 const created=new Map(report.created_by_country_category_tier.map(row=>
  [row.country_iso3+"|"+row.category+"|"+row.tier,row.created_total]));
 const deliveries=new Map(report.delivery_by_country_category_tier.map(row=>
  [row.country_iso3+"|"+row.category+"|"+row.tier,row]));
 const keys=[...new Set([...created.keys(),...deliveries.keys()])].sort();
 for(const key of keys){
  const [country_iso3,category,tier]=key.split("|");
  const delivery=deliveries.get(key)??{sent:0,delivered:0,failed:0,
   expected_geomacro_net_usd:"0.00"};
  const terms=PRICE[tier]??{customer:0,fee:0};
  rows.push([report.day_utc,country_iso3,category,tier,created.get(key)??0,
   delivery.sent,delivery.delivered,delivery.failed,terms.customer,
   delivery.expected_geomacro_net_usd,terms.fee]);
 }
 if(rows.length===1)rows.push([report.day_utc,"","","",0,report.sent_to_predge_total,
  report.delivered_total,report.failed_total,"0.00",report.expected_geomacro_net_usd,"0.05"]);
 return rows.map(row=>row.map(csvCell).join(",")).join("\n")+"\n";
}
function csvRecords(text){
 const records=[];let row=[],cell="",quoted=false;
 for(let i=0;i<text.length;i++){
  const ch=text[i];
  if(quoted){
   if(ch==='"'&&text[i+1]==='"'){cell+='"';i++}
   else if(ch==='"')quoted=false;
   else cell+=ch;
  }else if(ch==='"')quoted=true;
  else if(ch===","){row.push(cell);cell=""}
  else if(ch==="\n"){row.push(cell);records.push(row);row=[];cell=""}
  else if(ch!=="\r")cell+=ch;
 }
 if(quoted)fail("PARTNER_CSV_UNTERMINATED_QUOTE");
 if(cell.length||row.length){row.push(cell);records.push(row)}
 if(!records.length)return [];
 const headers=records.shift().map(x=>x.trim());
 return records.filter(r=>r.some(x=>x!=="")).map(cells=>
  Object.fromEntries(headers.map((header,index)=>[header,cells[index]??""])));
}
export function parsePartnerReport(source,{name="partner-report"}={}){
 if(typeof source!=="string")fail("PARTNER_REPORT_INVALID");
 let rows;
 if(/\.csv$/iu.test(name)){
  rows=csvRecords(source);
 }else{
  let parsed;try{parsed=JSON.parse(source)}catch{fail("PARTNER_JSON_INVALID")}
  rows=Array.isArray(parsed)?parsed:parsed?.deliveries;
 }
 if(!Array.isArray(rows))fail("PARTNER_ROWS_INVALID");
 return rows.map(row=>{
  if(!row||typeof row!=="object")fail("PARTNER_ROW_INVALID");
  const gro_id=String(row.gro_id??row.groId??"").trim();
  const receipt_sha256=String(row.receipt_sha256??row.receiptSha256??"").trim().toLowerCase();
  return {gro_id,receipt_sha256};
 });
}
export function reconcilePredgePartnerReport(ledgerRows,partnerRows){
 if(!Array.isArray(ledgerRows)||!Array.isArray(partnerRows))fail("DIFF_INPUT_INVALID");
 const key=(row)=>row.gro_id+"|"+row.receipt_sha256;
 const available=new Map();
 for(const row of ledgerRows){
  if(!["SENT","DELIVERED"].includes(row.delivery_status)||!row.gro_id)continue;
  const k=key(row);available.set(k,(available.get(k)??0)+1);
 }
 const matched=[],extra=[];
 for(const row of partnerRows){
  const k=key(row),remaining=available.get(k)??0;
  if(row.gro_id&&/^[a-f0-9]{64}$/u.test(row.receipt_sha256)&&remaining>0){
   matched.push({gro_id:row.gro_id,receipt_sha256:row.receipt_sha256});
   available.set(k,remaining-1);
  }else extra.push({gro_id:row.gro_id,receipt_sha256:row.receipt_sha256});
 }
 const missing=[];
 for(const [k,count] of available){
  if(count<=0)continue;
  const [gro_id,receipt_sha256]=k.split("|");
  for(let i=0;i<count;i++)missing.push({gro_id,receipt_sha256});
 }
 return {matched_count:matched.length,missing_in_predge_count:missing.length,
  extra_in_predge_count:extra.length,matched,missing_in_predge:missing,extra_in_predge:extra};
}

async function readD1(sql,params,{env=process.env,fetchImpl=fetch}={}){
 const account=env.CLOUDFLARE_ACCOUNT_ID,token=env.CLOUDFLARE_API_TOKEN;
 if(!/^[a-f0-9]{32}$/iu.test(account??"")||typeof token!=="string"||token.length<20)
  fail("CLOUDFLARE_AUTH_MISSING");
 const url=`https://api.cloudflare.com/client/v4/accounts/${account}/d1/database/${DATABASE_ID}/query`;
 let response;
 try{response=await fetchImpl(url,{method:"POST",redirect:"error",signal:AbortSignal.timeout(20000),
  headers:{Authorization:"Bearer "+token,"Content-Type":"application/json"},
  body:JSON.stringify({sql,params})})}catch{fail("D1_PROVIDER_UNAVAILABLE")}
 if(response?.status!==200)fail("D1_PROVIDER_HTTP_NOT_OK");
 let body;try{body=await response.json()}catch{fail("D1_RESPONSE_INVALID")}
 if(body?.success!==true||!Array.isArray(body.result)||body.result.length!==1||
    !Array.isArray(body.result[0]?.results))fail("D1_RESPONSE_SHAPE_INVALID");
 return body.result[0].results;
}
export async function readPredgeDailyLedger({day,env=process.env,fetchImpl=fetch}={}){
 if(!validDay(day))fail("DAY_INVALID");
 const start=day+"T00:00:00.000Z",end=new Date(Date.parse(start)+86400000).toISOString();
 const created=await readD1("SELECT gro_id,country_iso3,category,created_at,payload_json "+
  "FROM risk_stream_signed_gro WHERE created_at>=? AND created_at<? "+
  "AND category IN ('GEOPOLITICS','MACRO_FX','CRITICAL_MINERALS')",[start,end],{env,fetchImpl});
 const deliveries=await readD1("SELECT delivery_event_id,endpoint_version,request_id,gro_id,"+
  "receipt_sha256,day_utc,country_iso3,category,tier,customer_price_usd,"+
  "geomacro_net_usd,predge_fee_usd,delivery_status,created_at "+
  "FROM predge_risk_gate_delivery_ledger WHERE day_utc=? "+
  "AND category IN ('GEOPOLITICS','MACRO_FX','CRITICAL_MINERALS') ORDER BY created_at,delivery_event_id",
  [day],{env,fetchImpl});
 return {created,deliveries};
}
function parseArgs(argv){
 const out={day:new Date().toISOString().slice(0,10),partnerReport:null,
  outDir:resolve("artifacts/predge-daily-delivery")};
 for(let i=0;i<argv.length;i++){
  const arg=argv[i];
  if(arg==="--day")out.day=argv[++i];
  else if(arg==="--partner-report")out.partnerReport=argv[++i];
  else if(arg==="--out-dir")out.outDir=resolve(argv[++i]);
  else fail("ARGUMENT_INVALID");
 }
 if(!validDay(out.day))fail("DAY_INVALID");
 return out;
}
export async function runPredgeDailyReconciliation({day,partnerReport,outDir,
 env=process.env,fetchImpl=fetch}={}){
 const {created,deliveries}=await readPredgeDailyLedger({day,env,fetchImpl});
 const report=aggregatePredgeDailyLedger(created,deliveries,{day});
 if(partnerReport){
  const source=readFileSync(partnerReport,"utf8");
  const partnerRows=parsePartnerReport(source,{name:basename(partnerReport)});
  report.reconciliation=reconcilePredgePartnerReport(deliveries,partnerRows);
 }
 if(outDir){
  mkdirSync(outDir,{recursive:true});
  writeFileSync(resolve(outDir,day+".json"),JSON.stringify(report,null,2)+"\n");
  writeFileSync(resolve(outDir,day+".csv"),renderPredgeDailyCsv(report));
 }
 return report;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 try{
  const args=parseArgs(process.argv.slice(2));
  const report=await runPredgeDailyReconciliation(args);
  process.stdout.write(JSON.stringify(report,null,2)+"\n");
 }catch(error){
  process.stderr.write(String(error?.message??"PREDGE_DAILY_RECONCILIATION_FAILED").slice(0,160)+"\n");
  process.exitCode=2;
 }
}
