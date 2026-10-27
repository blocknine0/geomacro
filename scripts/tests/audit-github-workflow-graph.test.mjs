import test from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {auditWorkflowGraph} from "../ops/audit-github-workflow-graph.mjs";

test("audit classifies every retained workflow without authorizing deletion or reading live secrets",()=>{
 const a=auditWorkflowGraph();
 assert.ok(a.retained_workflow_count>=300);
 assert.equal(a.retained_workflow_count,a.nodes.length);
 assert.equal(a.retirement_permitted,false);
 assert.equal(a.run_history_audited,false);
 assert.equal(a.provider_quota_or_cost_verified,false);
 assert.equal(a.frozen_predge_workflows_unchanged,true);
 assert.equal(new Set(a.nodes.map(n=>n.filename)).size,a.nodes.length);
 for(const node of a.nodes){
  assert.equal(node.safe_to_retire,false);
  assert.equal(node.last_actual_run,"NOT_CHECKED_OFFLINE");
  assert.ok(!Object.hasOwn(node,"secret_values"));
  assert.ok(node.github_secret_names_referenced.every(n=>/^[A-Z][A-Z0-9_]*$/.test(n)));
 }
});
test("isolated workflow fixtures detect name-trigger and caller relationships",()=>{
 const root=mkdtempSync(join(tmpdir(),"geomacro-actions-audit-"));
 try{
  mkdirSync(join(root,"config"));mkdirSync(join(root,".github/workflows"),{recursive:true});
  writeFileSync(join(root,"config/github-workflow-inventory.v1.json"),JSON.stringify({
   repository:"fixture/geomacro",retainedWorkflowFiles:["producer.yml","consumer.yml"],
   criticalWorkflowFiles:["producer.yml"],predgeBlobSha1:{},
   archivedWorkflowFiles:[],
  }));
  writeFileSync(join(root,".github/workflows/producer.yml"),[
   "name: Official Publisher","on:","  schedule:","    - cron: \"17 * * * *\"",
   "jobs:","  work:","    runs-on: ubuntu-latest",
   "    steps:","      - run: echo publisher",
  ].join("\n")+"\n");
  writeFileSync(join(root,".github/workflows/consumer.yml"),[
   "name: Downstream","on:","  workflow_run:",
   "    workflows: [\"Official Publisher\"]","    types: [completed]",
   "  workflow_dispatch: {}","jobs:","  work:","    runs-on: ubuntu-latest",
   "    steps:","      - run: gh workflow run missing.yml",
   "      - run: echo ${{ secrets.READ_TOKEN }}",
  ].join("\n")+"\n");
  const a=auditWorkflowGraph(root);
  assert.equal(a.retained_workflow_count,2);
  assert.equal(a.nodes.find(n=>n.filename==="producer.yml").classification,"CRITICAL_PROTECTED");
  const consumer=a.nodes.find(n=>n.filename==="consumer.yml");
  assert.ok(consumer.triggers.includes("workflow_run"));
  assert.deepEqual(consumer.workflow_run_display_names,["Official Publisher"]);
  assert.ok(consumer.called_workflow_files.includes("missing.yml"));
  assert.deepEqual(consumer.github_secret_names_referenced,["READ_TOKEN"]);
  assert.deepEqual(a.unresolved_local_references,[{
   from:"consumer.yml",target:"missing.yml",kind:"UNRESOLVED_FILE_REFERENCE"
  }]);
 }finally{rmSync(root,{recursive:true,force:true})}
});
test("manifest drift refuses to classify or falsely certify a partial workflow graph",()=>{
 const root=mkdtempSync(join(tmpdir(),"geomacro-actions-drift-"));
 try{
  mkdirSync(join(root,"config"));mkdirSync(join(root,".github/workflows"),{recursive:true});
  writeFileSync(join(root,"config/github-workflow-inventory.v1.json"),JSON.stringify({
   repository:"fixture/geomacro",retainedWorkflowFiles:["lost.yml"],
   archivedWorkflowFiles:[]
  }));
  assert.throws(()=>auditWorkflowGraph(root),/WORKFLOW_AUDIT_INVENTORY_DRIFT/);
 }finally{rmSync(root,{recursive:true,force:true})}
});
