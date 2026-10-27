#!/usr/bin/env node
/**
 * #2945: OFFLINE, read-only, non-destructive workflow trigger + dependency
 * census. Generates a candidate review graph, never an automatic retirement
 * list. Actual run/cron/cost evidence and external dispatch callers require
 * a separate live audit before any workflow can be archived.
 *
 * No GitHub API calls, no credentials, no Cloudflare/D1/B2 usage.
 */
import {readFileSync,readdirSync,existsSync} from "node:fs";
import {join,resolve} from "node:path";
import {fileURLToPath} from "node:url";

const yaml=/\.ya?ml$/u;
const basename=x=>x.split("/").at(-1);
const quoted=x=>x.replace(/^['"]|['"]$/gu,"").trim();
const exactString=x=>typeof x==="string"&&x.length>0;
const safeKeys=text=>[...new Set(
  [...text.matchAll(/\$\{\{\s*secrets\.([A-Z][A-Z0-9_]*)\s*\}\}/gu)]
    .map(m=>m[1]))].sort();

function topOn(text){
 const match=text.match(/^(?:on|"on"|'on'):\s*(?:\r?\n|\{[^\n]*\}|\[[^\n]*\])/mu);
 if(!match)return "";
 const start=match.index+match[0].length;
 const inline=match[0].split(":").slice(1).join(":").trim();
 if(inline)return inline;
 const next=text.slice(start);
 const end=next.search(/^(?!\s|#|$)\S/mu);
 return end<0?next:next.slice(0,end);
}
function listTriggers(text){
 const on=topOn(text);
 if(!on)return [];
 const known=["schedule","workflow_run","workflow_dispatch","workflow_call",
   "repository_dispatch","push","pull_request","pull_request_target",
   "issues","issue_comment","release","deployment_status","check_run",
   "create","delete","workflow_job","status","discussion","page_build"];
 return known.filter(k=>new RegExp("(?:^|[\\s,{])"+k+"\\s*(?::|[,}\\]])","u").test(on));
}
function workflowRunNames(text){
 const block=topOn(text);
 // workflow_run only: do not mistake an unrelated top-level workflows: value.
 const match=block.match(/^\s{2}workflow_run:\s*\r?\n([\s\S]*?)(?=^\s{2}\S|$)/mu);
 if(!match)return [];
 const group=match[1].match(/^\s{4}workflows:\s*\[([^\]]+)\]/mu);
 if(!group)return [];
 return group[1].split(",").map(quoted).filter(Boolean);
}
function referencedWorkflows(text){
 const out=new Set();
 for(const m of text.matchAll(/uses:\s*['"]?\.\/\.github\/workflows\/([\w.-]+\.ya?ml)/gu))
  out.add(m[1]);
 for(const m of text.matchAll(/actions\/workflows\/([\w.-]+\.ya?ml)\/dispatches/gu))
  out.add(m[1]);
 for(const m of text.matchAll(/\bgh\s+workflow\s+run\s+['"]?([\w.-]+\.ya?ml)/gu))
  out.add(m[1]);
 return [...out].sort();
}
function sourceHints(text){
 return [...new Set([...text.matchAll(/(?:\.{0,2}\/)?\.github\/workflows\/([\w.-]+\.ya?ml)/gu)]
   .map(m=>m[1]))].sort();
}
function displayName(file,text){
 const m=text.match(/^name:\s*([^\r\n]+)$/mu);
 return m?quoted(m[1]):file;
}
function classify(triggers,filename,manifest){
 if(Object.hasOwn(manifest.predgeBlobSha1??{},filename))return "PREDGE_FROZEN";
 if((manifest.criticalWorkflowFiles??[]).includes(filename))return "CRITICAL_PROTECTED";
 if(triggers.includes("schedule"))return "LIVE_SCHEDULED_CANDIDATE";
 if(triggers.includes("workflow_call"))return "REUSABLE_CALLEE_CANDIDATE";
 if(triggers.includes("workflow_run")||triggers.includes("repository_dispatch"))return "DEPENDENCY_EVENT_CANDIDATE";
 if(triggers.includes("pull_request")||triggers.includes("pull_request_target"))return "PR_CI_SAFETY_CANDIDATE";
 if(triggers.includes("push"))return "PUSH_EVENT_CANDIDATE";
 if(triggers.length===1&&triggers[0]==="workflow_dispatch")return "MANUAL_RECOVERY_OR_ONESHOT_CANDIDATE";
 return "REVIEW_REQUIRED";
}

export function auditWorkflowGraph(root=process.cwd()){
 const file=join(root,"config/github-workflow-inventory.v1.json");
 const manifest=JSON.parse(readFileSync(file,"utf8"));
 const dir=join(root,".github/workflows");
 const actual=readdirSync(dir).filter(name=>yaml.test(name)).sort();
 const retained=[...manifest.retainedWorkflowFiles].sort();
 if(retained.length!==actual.length||actual.some((name,i)=>name!==retained[i]))
   throw Error("WORKFLOW_AUDIT_INVENTORY_DRIFT");
 const nodes=actual.map(filename=>{
  const source=readFileSync(join(dir,filename),"utf8");
  const triggers=listTriggers(source);
  return {filename,name:displayName(filename,source),triggers,
   classification:classify(triggers,filename,manifest),
   pinned_critical:(manifest.criticalWorkflowFiles??[]).includes(filename),
   predge_frozen:Object.hasOwn(manifest.predgeBlobSha1??{},filename),
   called_workflow_files:referencedWorkflows(source),
   workflow_run_display_names:workflowRunNames(source),
   other_workflow_file_mentions:sourceHints(source),
   github_secret_names_referenced:safeKeys(source),
   last_actual_run:"NOT_CHECKED_OFFLINE",monthly_actions_minutes:"UNKNOWN",
   d1_b2_usage:"UNKNOWN",safe_to_retire:false};
 });
 const byName=new Map();
 for(const n of nodes)byName.set(n.name,[...(byName.get(n.name)??[]),n.filename]);
 const names=new Set(actual);
 const externalReferences=[];
 for(const n of nodes){
  for(const target of n.called_workflow_files){
   if(!names.has(target))externalReferences.push({from:n.filename,target,kind:"UNRESOLVED_FILE_REFERENCE"});
  }
  for(const display of n.workflow_run_display_names){
   if(!byName.has(display))externalReferences.push({from:n.filename,target:display,kind:"UNRESOLVED_DISPLAY_TRIGGER"});
  }
 }
 const counts=Object.fromEntries([...new Set(nodes.map(x=>x.classification))]
   .sort().map(k=>[k,nodes.filter(n=>n.classification===k).length]));
 return {schema:"geomacro.workflow-static-audit.v1",
  repository:manifest.repository,scan_scope:"ALL_RETAINED_ACTIONS_YAML",
  retained_workflow_count:nodes.length,archived_workflow_count:manifest.archivedWorkflowFiles.length,
  classification_counts:counts,unresolved_local_references:externalReferences,
  external_script_callers_audited:false,run_history_audited:false,
  provider_quota_or_cost_verified:false,retirement_permitted:false,
  frozen_predge_workflows_unchanged:true,
  evidence:"STATIC_SOURCE_ONLY_NOT_LIVE_ACCEPTANCE",
  nodes};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const report=auditWorkflowGraph(process.cwd());
  const full=process.argv.includes("--json");
  console.log(JSON.stringify(full?report:{
   schema:report.schema,retained_workflow_count:report.retained_workflow_count,
   archived_workflow_count:report.archived_workflow_count,
   classification_counts:report.classification_counts,
   unresolved_local_references:report.unresolved_local_references,
   run_history_audited:false,retirement_permitted:false,
  },null,2));
 }catch(e){console.error(e instanceof Error?e.message:"WORKFLOW_AUDIT_UNAVAILABLE");process.exitCode=2;}
}
