#!/usr/bin/env node
// Deterministic, offline GitHub Actions allowlist and Predge frozen-contract gate.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import {auditWorkflowGraph} from "./audit-github-workflow-graph.mjs";

const root = process.cwd();
const manifest = JSON.parse(fs.readFileSync(path.join(root,"config/github-workflow-inventory.v1.json"),"utf8"));
const dir = path.join(root,".github/workflows");
const actual = fs.readdirSync(dir).filter(f => /\.ya?ml$/.test(f)).sort();
const allowed = [...manifest.retainedWorkflowFiles].sort();
const errors = [];
const absent = allowed.filter(f => !actual.includes(f));
const unexpected = actual.filter(f => !allowed.includes(f));
if (absent.length) errors.push("Missing registered workflows: " + absent.join(", "));
if (unexpected.length) errors.push("Unregistered workflows: " + unexpected.join(", "));
if (new Set(allowed).size !== allowed.length) errors.push("Duplicate workflow entries in allowlist");
if (new Set(manifest.criticalWorkflowFiles).size !== manifest.criticalWorkflowFiles.length) errors.push("Duplicate critical filenames");
for (const filename of manifest.criticalWorkflowFiles) {
  if (!actual.includes(filename)) errors.push("Critical production workflow missing: " + filename);
}
for (const [filename, expectedName] of Object.entries(manifest.lockedDisplayNames)) {
  if (!actual.includes(filename)) continue;
  const body = fs.readFileSync(path.join(dir,filename),"utf8");
  const m = body.match(/^name:\s*['"]?(.*?)['"]?\s*$/m);
  if (!m || m[1] !== expectedName) errors.push("Workflow display name changed: " + filename + " (expected " + expectedName + ")");
  if (!/^on:\s*$/m.test(body)) errors.push("Workflow triggers missing: " + filename);
}
for (const [filename, fragments] of Object.entries(manifest.lockedTriggerStrings)) {
  if (!actual.includes(filename)) continue;
  const body = fs.readFileSync(path.join(dir,filename),"utf8");
  for (const fragment of fragments) {
    if (!body.includes(fragment)) errors.push("Protected trigger/dependency changed: " + filename + " -> " + fragment);
  }
}
for (const [filename, sha] of Object.entries(manifest.predgeBlobSha1)) {
  if (!actual.includes(filename)) {errors.push("Predge frozen workflow missing: " + filename);continue;}
  const bytes = fs.readFileSync(path.join(dir,filename));
  const hdr = Buffer.from("blob " + bytes.length + "\0");
  const current = crypto.createHash("sha1").update(hdr).update(bytes).digest("hex");
  if (current !== sha) errors.push("Predge frozen workflow content changed: " + filename);
}
for (const filename of manifest.archivedWorkflowFiles) {
  if (actual.includes(filename)) errors.push("Archived workflow unexpectedly active: " + filename);
  if (!fs.existsSync(path.join(root,manifest.archiveDirectory,filename))) errors.push("Archived workflow source missing: " + filename);
}
if (errors.length) {
  for (const error of errors) console.error("::error::" + error);
  process.exit(1);
}
// Fully account for every retained YAML as a trigger/dependency candidate.
 // Classification is static-only and does NOT authorize retirement.
const audit=auditWorkflowGraph(root);
if(audit.retained_workflow_count!==allowed.length||
   audit.nodes.filter(n=>n.predge_frozen).length!==Object.keys(manifest.predgeBlobSha1).length||
   audit.nodes.some(n=>n.safe_to_retire!==false)) {
  console.error("::error::WORKFLOW_AUDIT_COVERAGE_OR_FREEZE_INVALID");
  process.exit(1);
}
console.log("Workflow inventory OK: " + allowed.length + " registered, " + manifest.criticalWorkflowFiles.length + " critical pinned, " + Object.keys(manifest.predgeBlobSha1).length + " Predge frozen, " + manifest.archivedWorkflowFiles.length + " reversibly archived.");
