#!/usr/bin/env node
/**
 * #2945: offline, read-only census of implicit GitHub Actions dispatches in
 * executable source files outside .github/workflows. This deliberately never
 * deletes/disables a workflow, makes an automated retirement decision, calls
 * the GitHub API, or exposes secret values. Dynamic call sites are recorded
 * as unresolved hazards: absence of a static match is NOT absence of a caller.
 */
import {readFileSync,readdirSync,statSync,existsSync} from "node:fs";
import {join,relative,resolve} from "node:path";
import {pathToFileURL} from "node:url";

const CODE_ROOTS=["scripts","src","workers","global-intelligence","config",".github/actions"];
const EXT=/\.(?:mjs|cjs|js|ts|tsx|sh|bash|json|yml|yaml)$/u;
const EXCLUDED=new Set(["node_modules",".git","dist","build","coverage","vendor","artifacts"]);
const MAX_FILES=16_000,MAX_FILE_BYTES=384_000;
const SAFE_FILENAME=/^[A-Za-z0-9_.-]+\.ya?ml$/u;
const ghRun=/\bgh\s+workflow\s+run\s+["'`]?([A-Za-z0-9_.-]+\.ya?ml)\b/gu;
const dispatchPath=/\bactions\/workflows\/([A-Za-z0-9_.-]+\.ya?ml)\/dispatches\b/gu;
const workflowFilePath=/\.github\/workflows\/([A-Za-z0-9_.-]+\.ya?ml)\b/gu;
const dynamicGhRun=/\bgh\s+workflow\s+run\b/gu;
const toSortedValues=set=>[...set].sort();
export function auditImplicitWorkflowCodeCallers(root=process.cwd()){
  const manifest=JSON.parse(readFileSync(join(root,"config/github-workflow-inventory.v1.json"),"utf8"));
  const names=new Set(manifest.retainedWorkflowFiles);
  if(!names.size||[...names].some(x=>!SAFE_FILENAME.test(x)))
    throw Error("WORKFLOW_CODE_AUDIT_MANIFEST_INVALID");
  const callers=new Map();
  const missing=new Map();
  const dynamic=new Set();
  let seen=0,skippedOversize=0,skippedUnsupported=0;
  const push=(map,workflow,source,kind)=>{
    const key=workflow+"|"+source+"|"+kind;
    map.set(key,{workflow,source,kind});
  };
  for(const dir of CODE_ROOTS){
    const rootDir=join(root,dir);
    if(!existsSync(rootDir))continue;
    const visit=(path)=>{
      for(const entry of readdirSync(path,{withFileTypes:true})){
        if(EXCLUDED.has(entry.name))continue;
        const full=join(path,entry.name);
        if(entry.isDirectory()){visit(full);continue}
        if(!entry.isFile())continue; // never traverse symlinks
        const source=relative(root,full).replaceAll("\\","/");
        if(!EXT.test(entry.name)){skippedUnsupported++;continue}
        seen++;if(seen>MAX_FILES)throw Error("WORKFLOW_CODE_AUDIT_FILE_BUDGET_EXCEEDED");
        if(statSync(full).size>MAX_FILE_BYTES){skippedOversize++;continue}
        const code=readFileSync(full,"utf8");
        let staticRuns=0;
        for(const [kind,re] of [["CLI_DISPATCH",ghRun],
          ["REST_DISPATCH",dispatchPath],["PATH_REFERENCE",workflowFilePath]]){
          // matchAll creates a fresh iterator (unlike re.exec with shared state).
          for(const match of code.matchAll(re)){
            const workflow=match[1];if(!SAFE_FILENAME.test(workflow))continue;
            push(names.has(workflow)?callers:missing,workflow,source,kind);
            if(kind==="CLI_DISPATCH")staticRuns++;
          }
        }
        const total=[...code.matchAll(dynamicGhRun)].length;
        if(total>staticRuns)dynamic.add(source);
      }
    };
    visit(rootDir);
  }
  const sort=(a,b)=>a.workflow.localeCompare(b.workflow)||
    a.source.localeCompare(b.source)||a.kind.localeCompare(b.kind);
  return Object.freeze({
    schema:"geomacro.actions-executable-code-callers.v1",
    repository:manifest.repository,
    registered_workflows:names.size,
    files_inspected:seen-skippedOversize,
    files_skipped_oversize:skippedOversize,
    unsupported_non_code_files_skipped:skippedUnsupported,
    code_roots_scanned:CODE_ROOTS,
    static_references:[...callers.values()].sort(sort),
    references_to_unregistered_workflows:[...missing.values()].sort(sort),
    dynamic_dispatch_files:toSortedValues(dynamic),
    has_unresolved_external_dispatch_callers:true,
    remote_callers_not_inferred_absent:true,
    live_run_history_not_checked:true,
    source_graph_is_complete:false,
    automated_retirement_allowed:false,
    frozen_predge_definitions_changed:false,
  });
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 try{
  const audit=auditImplicitWorkflowCodeCallers();
  const full=process.argv.includes("--json");
  console.log(JSON.stringify(full?audit:{
    schema:audit.schema,registered_workflows:audit.registered_workflows,
    files_inspected:audit.files_inspected,
    files_skipped_oversize:audit.files_skipped_oversize,
    static_reference_count:audit.static_references.length,
    missing_reference_count:audit.references_to_unregistered_workflows.length,
    dynamic_dispatch_file_count:audit.dynamic_dispatch_files.length,
    automated_retirement_allowed:false,
    source_graph_is_complete:false,
  },null,2));
 }catch(error){
  console.error(error instanceof Error?error.message:"WORKFLOW_CODE_AUDIT_FAILED");
  process.exitCode=2;
 }
}
