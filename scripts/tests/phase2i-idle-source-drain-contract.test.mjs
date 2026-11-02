import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const workflow=readFileSync(".github/workflows/private-global-osint-15m.yml","utf8");
const script=readFileSync("scripts/ops/phase2i-source-queue-extra-drain.ts","utf8");
test("legacy held-spool recovery gets entire approved writer before idle source replay",()=>{
 const start=workflow.indexOf("  replay-quota-held-encrypted-spool:");
 const end=workflow.indexOf("  collect-unverified-private:",start);
 assert.ok(start>0&&end>start);
 const section=workflow.slice(start,end);
 assert.match(section,/needs: \[verify, quota-admission, collect-source-intake-only\]/u);
 assert.match(section,/needs\.quota-admission\.outputs\.source_intake == 'true'/u);
 assert.match(section,/needs\.quota-admission\.outputs\.critical == 'true'/u);
 assert.match(section,/needs\.quota-admission\.outputs\.research == 'true'/u);
 assert.match(section,/github\.event_name == 'schedule'/u);
 assert.match(section,/node scripts\/ops\/private-osint-replay-held\.mjs \| tee "\$receipt"/u);
 assert.match(section,/\.state=="NO_FRESH_ENCRYPTED_BACKLOG"/u);
 assert.match(section,/\.d1_write_attempted==false/u);
 assert.match(section,/PHASE2I_HELD_SPOOL_EMPTY_VERIFIED=1/u);
 assert.match(section,/if: env\.PHASE2I_HELD_SPOOL_EMPTY_VERIFIED == '1'/u);
 assert.match(section,/bun scripts\/ops\/phase2i-source-queue-extra-drain\.ts/u);
 assert.doesNotMatch(section,/continue-on-error: true/u);
});
test("extra ingestion accepts only trusted current main ciphertext and exact D1 receipts",()=>{
 for(const p of [
  /GITHUB_ACTIONS!=="true"/u,
  /GITHUB_REPOSITORY!=="blocknine0\/geomacro"/u,
  /GITHUB_REF!=="refs\/heads\/main"/u,
  /GITHUB_EVENT_NAME!=="schedule"/u,
  /PHASE2I_HELD_SPOOL_EMPTY_VERIFIED!=="1"/u,
  /PHASE2I_PROVIDER_SOURCE_INTAKE!=="true"/u,
  /PHASE2I_PROVIDER_CRITICAL!=="true"/u,
  /PHASE2I_PROVIDER_RESEARCH!=="true"/u,
  /unsealPrivatePhase2iSourceBacklog/u,
  /PHASE2I_BACKLOG_ARTIFACT/u,
  /env\.GITHUB_RUN_ID/u,
  /d1_readback_verified!==true/u,
  /maxRows:Number\(env\.PHASE2I_PROVIDER_MAX_NEW_ROWS\)/u,
  /derive:deriveStatelessSignals/u,
 ])assert.match(script,p);
 assert.match(script,/source_fetches:0/u);
 assert.match(script,/extra_b2_requests:0/u);
 assert.match(script,/rights_verified:false/u);
 assert.match(script,/predge_changed:false/u);
 assert.doesNotMatch(script,/console\.log\(.*(articleUrl|title|raw)/u);
});
