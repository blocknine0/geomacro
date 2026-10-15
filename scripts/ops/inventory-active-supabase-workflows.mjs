#!/usr/bin/env node
/**
 * Conservative static execution inventory for every canonical GitHub Actions
 * job. This is source-code evidence, NOT proof that runtime secrets, branch
 * rules or actual external services are configured. Never equate a grep hit
 * with a reachable Supabase connection (or absence of hits with zero calls).
 */
import { readdirSync, readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname, relative, extname } from "node:path";
import { fileURLToPath } from "node:url";
const ROOT=resolve(".github/workflows");
const OUTPUT="artifacts/active-supabase-dependency-inventory.json";
const SIGNAL=/\b(?:SUPABASE_DB_URL|APP_SUPABASE_URL|SUPABASE_URL|SUPABASE_SERVICE_ROLE_KEY|APP_SUPABASE_SERVICE_ROLE_KEY|SUPABASE_PROJECT_ID|GRI_DB_MODE|requireRiskSupabase|createGriDbClient|assert-authoritative-supabase|supabase\/functions|supabase\.co|psql\s|supabase\s+db\s|@supabase\/supabase-js)\b/iu;
const CONFIGS={
  "usgs-earthquake-hazards-sync.yml":"#2258 / official USGS read-only validation",
  "eurostat-government-debt-sync.yml":"#2258 / official Eurostat read-only validation",
  "world-bank-ppg-global-shadow-census.yml":"#2261 / official World Bank source-only census (full 4-module pending)",
  "telegram-b2-d1-consumer.yml":"#2260 / B2 hash-bound private D1 UNVERIFIED intake",
  "d1-shadow-backfill.yml":"#2259 / obsolete shadow-copy job retired",
};
const YAMLS=[".yml",".yaml"];
const safeRead=path=>{try{return readFileSync(path,"utf8");}catch{return null}};
const safeRelative=path=>relative(process.cwd(),path).replaceAll("\\","/");
function stripComments(line){return line.trimStart().startsWith("#")?"":line}
function workflowTriggers(src){
 const lines=src.split(/\r?\n/);
 const i=lines.findIndex(l=>/^(?:on|"on"|'on'):\s*/u.test(l));
 if(i<0)return {kinds:[],verified:false};
 const start=lines[i].split(":").slice(1).join(":").trim();
 if(start&&start!=="{}"){
   const parsed=start.match(/\b(?:push|pull_request|pull_request_target|workflow_dispatch|schedule|workflow_run|repository_dispatch|workflow_call|merge_group)\b/gu)||[];
   return {kinds:[...new Set(parsed)].sort(),verified:parsed.length>0};
 }
 const set=new Set();
 for(let j=i+1;j<lines.length;j++){
  const l=stripComments(lines[j]);
  if(l.trim()&&!/^\s/u.test(l))break;
  const m=/^  ([a-z_]+):(?:\s|$)/u.exec(l);
  if(m)set.add(m[1]);
 }
 return {kinds:[...set].sort(),verified:set.size>0};
}
function workflowJobs(src){
 const lines=src.split(/\r?\n/);
 const i=lines.findIndex(l=>/^jobs:\s*$/u.test(l));
 if(i<0)return [];
 const jobs=[];
 let job=null;
 for(let j=i+1;j<lines.length;j++){
   const line=stripComments(lines[j]);
   if(line.trim()&&!/^\s/u.test(line))break;
   const m=/^  ([a-zA-Z0-9_-]+):\s*$/u.exec(line);
   if(m){job={job_id:m[1],start:j};jobs.push(job)}
 }
 return jobs.map((j,k)=>{
   const end=k+1<jobs.length?jobs[k+1].start:lines.length;
   const body=lines.slice(j.start,end).join("\n");
   const ifLine=/^    if:\s*(.+)$/mu.exec(body)?.[1]?.trim()??null;
   const frozen=ifLine!==null&&/^\$\{\{\s*false\s*\}\}$/u.test(ifLine);
   const conditions=[...body.matchAll(/^\s+if:\s*(.+)$/gmu)].map(x=>x[1]).slice(0,30);
   return {job_id:j.job_id,body,ifLine,frozen,conditions};
 });
}
function extractsReferencedFiles(body){
 // Inspect only local paths actually named in workflow source. It does not
 // infer runtime argument generation or arbitrary dynamic module imports.
 const found=new Set();
 for(const m of body.matchAll(/(?:^|[^a-z0-9_-])((?:scripts|src|workers|global-intelligence|server)\/[a-zA-Z0-9_.$/-]+\.(?:mjs|js|ts|tsx))\b/gmu)){
   const p=resolve(m[1]);
   if(!p.startsWith(process.cwd()+"/")||!existsSync(p))continue;
   found.add(p);
 }
 return [...found].slice(0,32);
}
function transitiveStaticFiles(files){
 const queue=files.map(path=>({path,depth:0})),seen=new Set(),findings=[];
 while(queue.length&&seen.size<60){
  const {path,depth}=queue.shift();
  if(seen.has(path))continue;seen.add(path);
  const content=safeRead(path);if(content===null)continue;
  if(SIGNAL.test(content))findings.push(safeRelative(path));
  if(depth>=2)continue;
  for(const m of content.matchAll(/\b(?:from|import|require\()\s*['"]([^'"]+)['"]/gmu)){
   const spec=m[1];if(!spec.startsWith("."))continue;
   const stem=resolve(dirname(path),spec);
   const candidates=[stem,stem+".ts",stem+".mjs",stem+".js",stem+".tsx"];
   const match=candidates.find(f=>existsSync(f)&&extname(f));
   if(match&&!seen.has(match))queue.push({path:match,depth:depth+1});
  }
 }
 return {checked_file_count:seen.size,matches:findings,recursive_depth_limit:2,complete_proof:false};
}
function reachability(job,triggers){
 if(job.frozen)return "FROZEN_STATIC_FALSE";
 if(!triggers.verified)return "UNKNOWN_TRIGGER_OR_CONDITIONAL";
 const kinds=triggers.kinds;
 const unattended=kinds.some(k=>["push","schedule","workflow_run","repository_dispatch","workflow_call","workflow_run","merge_group"].includes(k));
 if(unattended)return "POTENTIALLY_AUTO_REACHABLE_CONDITIONS_UNRESOLVED";
 if(kinds.includes("workflow_dispatch"))return "MANUAL_ONLY_CONDITIONS_UNRESOLVED";
 if(kinds.includes("pull_request")||kinds.includes("pull_request_target"))return "PR_ONLY_CONDITIONS_UNRESOLVED";
 return "CONDITIONAL_OR_UNKNOWN";
}
export function inventorySupabaseWorkflowJobs(){
 const files=readdirSync(ROOT).filter(f=>YAMLS.some(x=>f.endsWith(x))).sort();
 const entries=[];
 for(const name of files){
   const path=resolve(ROOT,name);
   const src=readFileSync(path,"utf8");
   const triggers=workflowTriggers(src);
   const jobs=workflowJobs(src);
   if(jobs.length===0)entries.push({
     workflow_path:".github/workflows/"+name,job_id:null,
     triggers:triggers.kinds,reachability:"NO_STATIC_JOB_OR_PARSE_UNRESOLVED",
     dependency:"UNDETERMINED",root_cause:null,
     permanent_replacement_or_retirement:CONFIGS[name]??null,
     pr_or_commit:null,exact_test_evidence:null,
     production_acceptance_status:"NOT_INFERRED_FROM_SOURCE",
   });
   for(const job of jobs){
     const transitive=transitiveStaticFiles(extractsReferencedFiles(job.body));
     const direct=SIGNAL.test(job.body);
     const status=reachability(job,triggers);
     const flagged=direct||transitive.matches.length>0;
     entries.push({
       workflow_path:".github/workflows/"+name,job_id:job.job_id,
       triggers:triggers.kinds,
       reachability:status,
       job_conditions:job.conditions,
       direct_supabase_reference:direct,
       transitive_supabase_static_matches:transitive.matches,
       scanned_local_files:transitive.checked_file_count,
       dependency:!flagged?"NO_STATIC_MATCH_NOT_RUNTIME_PROOF":
         status==="FROZEN_STATIC_FALSE"?"FROZEN_LEGACY_REFERENCE":
         "POTENTIAL_SUPABASE_RUNTIME_DEPENDENCY_REQUIRES_REVIEW",
       root_cause:flagged?"Legacy config/import/command reference; manual runtime trace required":null,
       permanent_replacement_or_retirement:CONFIGS[name]??null,
       pr_or_commit:CONFIGS[name]?.split(" / ")[0]??null,
       exact_test_evidence:null,production_acceptance_status:"NOT_INFERRED_FROM_SOURCE",
     });
   }
 }
 const possible=entries.filter(x=>x.dependency==="POTENTIAL_SUPABASE_RUNTIME_DEPENDENCY_REQUIRES_REVIEW");
 return {
   schema:"geomacro.active-supabase-dependency-inventory.v1",
   report_name:"ACTIVE_SUPABASE_DEPENDENCY_INVENTORY",
   generated_at:new Date().toISOString(),
   workflow_file_count:files.length,job_entry_count:entries.length,
   suspicious_reachable_job_count:possible.length,
   frozen_legacy_reference_count:entries.filter(x=>x.dependency==="FROZEN_LEGACY_REFERENCE").length,
   exhaustive_workflow_filenames:entries.length>=files.length,
   exhaustive_runtime_reachability_proven:false,
   zero_reachable_supabase_dependencies_proven:false,
   dynamic_imports_secret_availability_conditions_and_last_runs_unverified:true,
   no_new_supabase_connection:true,read_only_static_scan:true,
   x402_payment_attempts:0,b2_requests:0,d1_writes:0,
   entries,
 };
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const result=inventorySupabaseWorkflowJobs();
 mkdirSync("artifacts",{recursive:true});
 writeFileSync(OUTPUT,JSON.stringify(result,null,2)+"\n");
 console.log(JSON.stringify({
  report_name:result.report_name,workflow_file_count:result.workflow_file_count,
  job_entry_count:result.job_entry_count,
  suspicious_reachable_job_count:result.suspicious_reachable_job_count,
  frozen_legacy_reference_count:result.frozen_legacy_reference_count,
  zero_reachable_supabase_dependencies_proven:false,
  output:OUTPUT,
 }));
 if(result.workflow_file_count<250||result.job_entry_count<result.workflow_file_count)
  process.exitCode=2;
}
