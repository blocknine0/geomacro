#!/usr/bin/env node
import {execFileSync} from "node:child_process";
import {mkdirSync,readFileSync,writeFileSync} from "node:fs";
import {dirname,resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {dailySummaryCsv,reconcilePredgeDaily} from "../../workers/control-plane/src/predge-daily-delivery-ledger.mjs";

const root=resolve(dirname(fileURLToPath(import.meta.url)),"../..");
function argsOf(argv){
 const out={database:"geomacro-control-plane",outDir:resolve(root,"artifacts/predge-daily-delivery")};
 for(let i=0;i<argv.length;i++){
  const arg=argv[i];
  if(arg==="--partner-report"){
   const value=argv[++i];if(!value||value.startsWith("--"))throw Error("PARTNER_REPORT_PATH_REQUIRED");
   out.partnerReport=resolve(value);
  }
  else if(arg==="--day")out.day=argv[++i];
  else if(arg==="--database")out.database=argv[++i];
  else if(arg==="--out-dir")out.outDir=resolve(argv[++i]??"");
  else throw Error(`UNKNOWN_ARGUMENT:${arg}`);
 }
 return out;
}
function parseCsv(text){
 const lines=text.replace(/^\uFEFF/u,"").split(/\r?\n/u).filter(Boolean);
 if(lines.length<2)return [];
 const parseLine=line=>{const result=[];let value="",quoted=false;
  for(let i=0;i<line.length;i++){const c=line[i];if(quoted&&c==='"'&&line[i+1]==='"'){value+='"';i++;}
   else if(c==='"')quoted=!quoted;else if(c===","&&!quoted){result.push(value);value="";}else value+=c;}
  result.push(value);return result;};
 const headers=parseLine(lines[0]);return lines.slice(1).map(line=>Object.fromEntries(parseLine(line).map((v,i)=>[headers[i],v])));
}
export function parsePartner(path){
 if(!path)return null;
 const raw=readFileSync(path,"utf8"),trim=raw.trim();
 if(trim.startsWith("[")||trim.startsWith("{")){
  const parsed=JSON.parse(trim);return Array.isArray(parsed)?parsed:
   Array.isArray(parsed.deliveries)?parsed.deliveries:Array.isArray(parsed.records)?parsed.records:
    Array.isArray(parsed.items)?parsed.items:[];
 }
 return parseCsv(raw);
}
function runQuery(database,sql){
 const raw=execFileSync("npx",["-y","wrangler@4.136.3","d1","execute",database,"--remote","--json","--command",sql],
  {encoding:"utf8",stdio:["ignore","pipe","pipe"],timeout:180000,maxBuffer:16*1024*1024});
 const parsed=JSON.parse(raw);
 if(Array.isArray(parsed))return parsed.flatMap(x=>Array.isArray(x?.results)?x.results:[]);
 if(Array.isArray(parsed?.results))return parsed.results;
 throw Error("D1_RESULT_SHAPE_INVALID");
}
function sqlQuote(value){return `'${String(value).replaceAll("'","''")}'`;}
function validDay(day){
 if(!/^\d{4}-\d{2}-\d{2}$/u.test(day))return false;
 const date=new Date(`${day}T00:00:00.000Z`);return Number.isFinite(date.valueOf())&&date.toISOString().slice(0,10)===day;
}
export function buildD1DailyQueries(day){
 if(!validDay(day))throw Error("INVALID_UTC_DAY");
 const start=`${day}T00:00:00`,next=new Date(Date.parse(`${day}T00:00:00.000Z`)+86400000).toISOString().slice(0,19);
 return {
  created:`SELECT gro_id,country_iso3,category,created_at,payload_json,`+
   `COALESCE(json_extract(payload_json,'$.eligible_derived_score.agent_decision.tier'),`+
   `json_extract(payload_json,'$.agent_decision.tier'),json_extract(payload_json,'$.tier')) AS tier `+
   `FROM risk_stream_signed_gro WHERE created_at>=${sqlQuote(start)} AND created_at<${sqlQuote(next)}`,
  deliveries:`SELECT gro_id,receipt_sha256,day_utc,country_iso3,category,tier,delivery_status `+
   `FROM risk_stream_predge_daily_delivery_ledger WHERE day_utc=${sqlQuote(day)}`
 };
}
export async function reconcileDaily({day,database="geomacro-control-plane",partnerReport=null,run=runQuery,outDir=null}){
 const sql=buildD1DailyQueries(day),createdRows=run(database,sql.created),deliveryRows=run(database,sql.deliveries);
 const partnerRows=partnerReport?parsePartner(partnerReport):null;
 const summary=reconcilePredgeDaily({day,createdRows,deliveryRows,partnerRows});
 if(outDir){mkdirSync(outDir,{recursive:true});
  writeFileSync(resolve(outDir,`${day}-summary.json`),JSON.stringify(summary,null,2)+"\n");
  writeFileSync(resolve(outDir,`${day}-summary.csv`),dailySummaryCsv(summary));}
 return summary;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const options=argsOf(process.argv.slice(2));
  options.day??=new Date().toISOString().slice(0,10);
  const result=await reconcileDaily({day:options.day,database:options.database,
   partnerReport:options.partnerReport,outDir:options.outDir});
  process.stdout.write(JSON.stringify({ok:true,day_utc:result.day_utc,
   json:resolve(options.outDir,`${result.day_utc}-summary.json`),
   csv:resolve(options.outDir,`${result.day_utc}-summary.csv`),summary:result},null,2)+"\n");
 }catch(error){process.stderr.write(`${error?.message??"RECONCILIATION_FAILED"}\n`);process.exitCode=1;}
}
