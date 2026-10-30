import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const workflow=readFileSync(new URL(
 "../../.github/workflows/private-global-osint-15m.yml",import.meta.url),"utf8");
const sourceOnly=readFileSync(new URL(
 "../ops/phase2i-source-only-raw-tick.ts",import.meta.url),"utf8");
test("provider reports source_intake separately from critical D1 publication admission",()=>{
 assert.match(workflow,/source_intake: \$\{\{ steps\.budget\.outputs\.source_intake \}\}/u);
 assert.match(workflow,/source_intake_max_new_rows: \$\{\{ steps\.budget\.outputs\.source_intake_max_new_rows \}\}/u);
 const full=workflow.slice(workflow.indexOf("  collect-private:"),
  workflow.indexOf("  collect-source-intake-only:"));
 assert.match(full,/needs\.quota-admission\.outputs\.critical == 'true'/u);
 assert.match(full,/needs\.quota-admission\.outputs\.research == 'true'/u);
 assert.match(full,/needs\.quota-admission\.outputs\.source_intake == 'true'/u);
});
test("critical-pacing hold with source approval does not become a full publisher or an encrypted D1-held clone",()=>{
 const lane=workflow.slice(workflow.indexOf("  collect-source-intake-only:"),
  workflow.indexOf("  stage-private-sources-when-d1-held:"));
 const held=workflow.slice(workflow.indexOf("  stage-private-sources-when-d1-held:"),
  workflow.indexOf("  collect-unverified-private:"));
 assert.match(lane,/needs\.quota-admission\.outputs\.research != 'true'/u);
 assert.match(lane,/needs\.quota-admission\.outputs\.source_intake == 'true'/u);
 assert.match(lane,/needs\.quota-admission\.result == 'success'/u);
 assert.match(lane,/github\.ref == 'refs\/heads\/main'/u);
 assert.match(lane,/github\.event_name == 'schedule'/u);
 assert.match(lane,/environment: production/u);
 assert.match(lane,/PHASE2I_PROVIDER_SOURCE_INTAKE:/u);
 assert.match(lane,/PHASE2I_PROVIDER_RESEARCH:/u);
 assert.match(lane,/PHASE2I_PROVIDER_MAX_NEW_ROWS:/u);
 assert.match(lane,/GEOMACRO_SOURCE_INTAKE_ONLY: "1"/u);
 assert.match(lane,/bun scripts\/ops\/phase2i-source-only-raw-tick\.ts/u);
 assert.doesNotMatch(held,/needs\.quota-admission\.outputs\.critical != 'true'/u);
 assert.match(held,/needs\.quota-admission\.outputs\.source_intake != 'true'/u);
});
test("source-only job strictly uses the existing provider budget and D1 intake without altering PREDGE or paid rights",()=>{
 for(const marker of ["GITHUB_ACTIONS","GITHUB_REPOSITORY","GITHUB_REF",
  "PHASE2I_PROVIDER_SOURCE_INTAKE","PHASE2I_PROVIDER_CRITICAL",
  "PHASE2I_PROVIDER_RESEARCH",
  "PHASE2I_PROVIDER_MAX_NEW_ROWS","GEOMACRO_SOURCE_INTAKE_ONLY"])
  assert.ok(sourceOnly.includes(marker),marker);
 assert.match(sourceOnly,/maxRows:admittedRows/u);
 assert.match(sourceOnly,/admittedRows=Math.min\(providerRows,5\)/u);
 assert.match(sourceOnly,/\[3,5,10,25,50\]\.includes\(Number\(env\.PHASE2I_PROVIDER_MAX_NEW_ROWS\)\)/u);
 assert.match(sourceOnly,/stagePhase2iOsintFairRaw/u);
 assert.match(sourceOnly,/createPhase2iSingleSweepOriginalIndex/u);
 assert.match(sourceOnly,/onOriginalCandidate:singleSweep\.observe/u);
 assert.match(sourceOnly,/candidates:indexed\.candidates/u);
 assert.match(sourceOnly,/\.\.\.indexed\.summary/u);
 assert.match(sourceOnly,/collectPrivateOsint15m/u);
 assert.match(sourceOnly,/includeLocalGapLane:true/u);
 assert.match(sourceOnly,/configured_country_category_routes!==585/u);
 assert.match(sourceOnly,/d1_readback_verified!==true/u);
 assert.doesNotMatch(sourceOnly,/persistPrivateOsintBatch|publishPrivateOsintWebsiteSignals|settleCoinbaseX402|raw\.article_body/u);
 assert.match(sourceOnly,/predge_modified:false,publication_attempted:false/u);
});
