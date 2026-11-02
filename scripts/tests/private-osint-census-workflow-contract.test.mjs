import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const workflow=readFileSync(new URL("../../.github/workflows/private-osint-585-census-daily.yml",import.meta.url),"utf8");
test("daily 585 OSINT census derives demand and mineral source worklists as separate executed steps",()=>{
 const demand=workflow.indexOf("node scripts/ops/build-revenue-source-demand-195x3.mjs");
 const minerals=workflow.indexOf("node scripts/ops/build-mineral-national-portal-repair.mjs");
 assert.ok(demand>0&&minerals>demand);
 const demandStep=workflow.slice(demand,workflow.indexOf("\n      - name:",demand));
 assert.ok(demandStep.includes("/tmp/geomacro-private-osint-native-gap-worklist.json \\\n            /tmp/geomacro-revenue-source-demand-195x3.json"));
 assert.ok(!demandStep.includes("/tmp/geomacro-mineral-national-portal-repair.json"));
 const mineralStep=workflow.slice(minerals,workflow.indexOf("\n      - name:",minerals));
 assert.match(mineralStep,/\/tmp\/geomacro-mineral-national-portal-repair\.json/u);
 const artifact=workflow.slice(workflow.indexOf("name: Preserve exact one-run counts-only source census"));
 assert.match(artifact,/\/tmp\/geomacro-mineral-national-portal-repair\.json/u);
 assert.ok(workflow.includes('cron: "11 3 * * *"'));
 assert.ok(workflow.includes('github.event_name == \'push\''));
});
