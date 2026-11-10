import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const root=new URL("../../",import.meta.url);
const read=path=>readFileSync(new URL(path,root),"utf8");
test("PR-only offline D1 checks are separated from production mutex; production deploy and migrations still serialize",()=>{
 const source=read(".github/workflows/deploy-d1-control-plane.yml");
 const shared="geomacro-d1-control-plane-production";
 assert.match(source,/group: \$\{\{ github\.event_name == 'pull_request' && format\('geomacro-d1-control-plane-pr-\{0\}', github\.event\.pull_request\.number\) \|\| 'geomacro-d1-control-plane-production' \}\}/u);
 assert.match(source,/cancel-in-progress: false/u);
 assert.match(source,/needs: d1-v2-canary-release-hold/u);
 assert.match(source,/config\/d1-hotspot-v2-canary\.hold/u);
 assert.match(source,/github\.ref == 'refs\/heads\/main'/u);
 // The production release and migration mutually exclude each other.
 for(const path of [
  ".github/workflows/canary-promotion.yml",
  ".github/workflows/production-rollout-orchestrator.yml",
  ".github/workflows/geomacro-protected-d1-canary-preflight.yml",
 ]){
  assert.ok(read(path).includes(shared),path+" must retain the shared production mutex");
 }
 assert.ok(source.includes("node --test scripts/tests/deploy-d1-pr-concurrency-isolation.test.mjs"));
});
