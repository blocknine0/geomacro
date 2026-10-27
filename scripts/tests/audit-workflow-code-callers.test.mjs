import test from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {auditImplicitWorkflowCodeCallers} from "../ops/audit-workflow-code-callers.mjs";

function fixture(){
 const root=mkdtempSync(join(tmpdir(),"geomacro-script-callers-"));
 mkdirSync(join(root,"config"),{recursive:true});
 mkdirSync(join(root,"scripts","ops"),{recursive:true});
 writeFileSync(join(root,"config/github-workflow-inventory.v1.json"),JSON.stringify({
  repository:"fixture/geomacro",
  retainedWorkflowFiles:["publisher.yml","consumer.yml"],
 }));
 return root;
}
test("offline executable code census includes script callers; flags missing/dynamic rather than retiring",()=>{
 const root=fixture();
 try{
  writeFileSync(join(root,"scripts/ops/trigger.sh"),[
   "gh workflow run publisher.yml",
   "curl -X POST https://api.github.com/repos/test/example/actions/workflows/consumer.yml/dispatches",
   "gh workflow run mystery.yml",
   "gh workflow run \"$DYNAMIC_WORKFLOW\"",
  ].join("\n")+"\n");
  writeFileSync(join(root,"scripts/ops/trace.mjs"),[
   'const path="./.github/workflows/publisher.yml";',
   'const secret="${{ secrets.MY_PRIVATE_KEY }}";',
  ].join("\n"));
  const v=auditImplicitWorkflowCodeCallers(root);
  assert.equal(v.registered_workflows,2);
  assert.deepEqual(v.static_references,[
   {workflow:"consumer.yml",source:"scripts/ops/trigger.sh",kind:"REST_DISPATCH"},
   {workflow:"publisher.yml",source:"scripts/ops/trigger.sh",kind:"CLI_DISPATCH"},
   {workflow:"publisher.yml",source:"scripts/ops/trace.mjs",kind:"PATH_REFERENCE"},
  ]);
  assert.deepEqual(v.references_to_unregistered_workflows,[
   {workflow:"mystery.yml",source:"scripts/ops/trigger.sh",kind:"CLI_DISPATCH"},
  ]);
  assert.deepEqual(v.dynamic_dispatch_files,["scripts/ops/trigger.sh"]);
  assert.equal(v.automated_retirement_allowed,false);
  assert.equal(v.live_run_history_not_checked,true);
  assert.equal(v.source_graph_is_complete,false);
  assert.equal(JSON.stringify(v).includes("MY_PRIVATE_KEY"),false,
    "the report must never include secret strings or values");
 }finally{rmSync(root,{recursive:true,force:true})}
});
test("real registered inventory is scanned but no deletion is ever authorized",()=>{
 const v=auditImplicitWorkflowCodeCallers();
 assert.ok(v.registered_workflows>=300);
 assert.ok(v.files_inspected>100);
 assert.equal(v.automated_retirement_allowed,false);
 assert.equal(v.remote_callers_not_inferred_absent,true);
 assert.equal(v.has_unresolved_external_dispatch_callers,true);
 assert.equal(v.frozen_predge_definitions_changed,false);
 for(const item of v.static_references){
  assert.match(item.workflow,/^[A-Za-z0-9_.-]+\.ya?ml$/);
  assert.ok(!item.source.startsWith(".github/workflows/"));
 }
});
