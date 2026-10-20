#!/usr/bin/env node
/**
 * Strictly read-only repository-wide cutover audit. This is intentionally a
 * conservative INVENTORY, not proof a dependency was removed. It cannot see
 * protected runtime env values, database bytes or externally deployed apps.
 * Zero credentials, external services, B2 requests, D1 writes or payments.
 */
import {existsSync,readdirSync,readFileSync,mkdirSync,writeFileSync,statSync} from "node:fs";
import {resolve,dirname,relative,extname} from "node:path";
import {fileURLToPath} from "node:url";
import {inventorySupabaseWorkflowJobs} from "./inventory-active-supabase-workflows.mjs";

const ROOT=process.cwd();
const OUTPUT="artifacts/supabase-d1-repository-crosscheck.json";
const CODE_EXT=new Set([".ts",".tsx",".mjs",".js",".yml",".yaml"]);
const CODE_ROOTS=["src","server","scripts","workers",".github/workflows","supabase/functions"];
const SKIP=new Set(["node_modules","dist","build","artifacts",".git","coverage","__snapshots__"]);
const REGEX={
  client:/@supabase\/supabase-js|createSupabaseClient|requireRiskSupabase\s*\(|getRiskSupabase\s*\(|getAppSupabase\s*\(|createGriDbClient\s*\(/u,
  privileged_env:/\b(?:SUPABASE_DB_URL|SUPABASE_SERVICE_ROLE_KEY|APP_SUPABASE_SERVICE_ROLE_KEY|APP_SUPABASE_URL|SUPABASE_URL|GRI_DB_MODE)\b/u,
  postgres:/\b(?:psql|postgres(?:ql)?):\/\/|direct-postgres-supabase-loader|supabase\s+db\s/u,
  endpoints:/supabase\.co|supabase\/functions|\/rest\/v1|\/auth\/v1|\/storage\/v1/u,
};
function walk(path,arr=[]){
 if(!existsSync(path))return arr;
 for(const ent of readdirSync(path,{withFileTypes:true})){
  if(SKIP.has(ent.name))continue;
  const full=resolve(path,ent.name);
  if(ent.isDirectory())walk(full,arr);
  else if(ent.isFile()&&CODE_EXT.has(extname(ent.name))&&ent.name.length<200)arr.push(full);
 }
 return arr;
}
const files=[...new Set(CODE_ROOTS.flatMap(p=>walk(resolve(ROOT,p))))].sort();
const contents=new Map(),byRelative=new Map();
for(const path of files){
 const name=relative(ROOT,path).replaceAll("\\","/");
 if(statSync(path).size>750_000)continue;
 const source=readFileSync(path,"utf8");
 contents.set(name,source);byRelative.set(name,path);
}
function matches(path,source){
 return Object.keys(REGEX).filter(k=>REGEX[k].test(source));
}
const direct=[...contents].map(([path,source])=>({
  path,signals:matches(path,source),
  classification:path.startsWith("supabase/functions/")?"SUPABASE_EDGE_DEPLOYED_SOURCE":
   path.startsWith(".github/workflows/")?"WORKFLOW_NEEDS_JOB_REACHABILITY":
   path.startsWith("src/routes/")||path.startsWith("server/api/")?"REQUEST_ENTRYPOINT":
   path.startsWith("workers/")?"WORKER_SOURCE":"TRANSITIVE_OR_OFFLINE_NEEDS_REVIEW"
})).filter(x=>x.signals.length>0);
const resultPath=(name,spec)=>{
 if(!spec.startsWith("."))return null;
 const folder=dirname(name);
 const stem=resolve(ROOT,folder,spec);
 const options=[stem,stem+".ts",stem+".tsx",stem+".mjs",stem+".js",
  resolve(stem,"index.ts"),resolve(stem,"index.mjs"),resolve(stem,"index.js")];
 for(const o of options){
   const rel=relative(ROOT,o).replaceAll("\\","/");
   if(byRelative.has(rel))return rel;
 }
 return null;
};
function imports(path,source){
 const out=[];
 const re=/(?:\bfrom\s*|\bimport\s*\(|\brequire\s*\()\s*["']([^"'\n]+)["']/gu;
 for(const m of source.matchAll(re)){
  const ref=resultPath(path,m[1]);
  if(ref)out.push(ref);
 }
 return [...new Set(out)];
}
const links=new Map([...contents].map(([p,s])=>[p,imports(p,s)]));
const entrypoints=[...contents.keys()].filter(p=>
 (p.startsWith("src/routes/")||p.startsWith("server/api/"))&&
 /.(?:ts|tsx|mjs|js)$/.test(p)&&!p.includes(".test."));
const requestPaths=[];
for(const ep of entrypoints){
 const visited=new Set([ep]),queue=[{path:ep,depth:0}],flags=[];
 while(queue.length&&visited.size<1100){
  const n=queue.shift();
  const source=contents.get(n.path)||"";
  const signals=matches(n.path,source);
  if(signals.length)flags.push({path:n.path,depth:n.depth,signals});
  if(n.depth>=12)continue;
  for(const child of links.get(n.path)||[]){
   if(visited.has(child))continue;
   visited.add(child);queue.push({path:child,depth:n.depth+1});
  }
 }
 if(flags.length)requestPaths.push({route:ep,supabase_related_import_or_direct_match:flags,
  transitive_nodes_examined:visited.size,
  dependency_proven_at_runtime:false});
}
const workflows=inventorySupabaseWorkflowJobs();
const totals=Object.fromEntries(Object.keys(REGEX).map(k=>[
 k,direct.filter(x=>x.signals.includes(k)).length
]));
const report={
 schema:"geomacro.supabase-d1-repository-crosscheck.v1",
 generated_at:new Date().toISOString(),
 canonical_source:"working_checkout_only",
 scope:"all enumerated source/server/workers/scripts/github-workflows/supabase-functions",
 file_count:contents.size,
 repo_static_reference_count:direct.length,ref_types:totals,
 route_entrypoints_scanned:entrypoints.length,
 route_import_graph_with_supabase_signals:requestPaths.length,
 workflow_files:workflows.workflow_file_count,
 workflow_jobs:workflows.job_entry_count,
 potentially_reachable_supabase_jobs:workflows.suspicious_reachable_job_count,
 frozen_legacy_workflow_jobs:workflows.frozen_legacy_reference_count,
 currently_serving_supabase_runtime_calls_proven_absent:false,
 all_supabase_data_migrated_to_d1_proven:false,
 legacy_payment_and_customer_records_safely_reconciled:false,
 owner_privilege_credentials_read:false,
 supabase_requests:0,d1_writes:0,b2_requests:0,payments:0,
 findings:direct,
 request_paths:requestPaths,
};
if(!direct.length||!requestPaths.length||workflows.workflow_file_count<250)throw Error("INVENTORY_INCOMPLETE");
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 mkdirSync(dirname(OUTPUT),{recursive:true});
 writeFileSync(OUTPUT,JSON.stringify(report,null,2)+"\n");
 console.log(JSON.stringify({
  schema:report.schema,file_count:report.file_count,
  static_references:report.repo_static_reference_count,
  entrypoints_with_supabase_imports:report.route_import_graph_with_supabase_signals,
  workflow_jobs:report.workflow_jobs,
  potentially_reachable_supabase_jobs:report.potentially_reachable_supabase_jobs,
  proven_zero_supabase:false,
  output:OUTPUT
 }));
}
export const inventorySupabaseRepositoryCutover=()=>report;
