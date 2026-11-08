import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync('scripts/canary-promoter.ts','utf8');
const workflow=readFileSync('.github/workflows/canary-promotion.yml','utf8');

test('six exact stage percentages and 1% minimum 30-minute observation',()=>{
 assert.match(source,/const STAGES=\[0,1,5,25,50,100\] as const/u);
 assert.match(source,/percent===1\?30\*60\*1000:15\*60\*1000/u);
 assert.match(source,/while\(Date\.now\(\)-began<windowMs\)/u);
 assert.match(source,/await wait\(Math\.min\(INTERVAL_MS,Math\.max\(1,windowMs/u);
 assert.match(workflow,/timeout-minutes: 170/u);
});
test('real 0% candidate split enables exact-version directed health, never baseline substitution',()=>{
 assert.match(source,/percent===100\?/u);
 assert.match(source,/\{version_id:base,percentage:100-percent\},\{version_id:candidate,percentage:percent\}/u);
 assert.match(source,/mutated=true;await deployVersions\(base,candidate,0\)/u);
 assert.match(source,/await checkSource\(candidate,sha\)/u);
 assert.match(source,/CANARY_DIRECTED_HEALTH_SHA_UNVERIFIED/u);
});
test('runtime enforces candidate-specific p95 no regression and tighter error thresholds',()=>{
 assert.match(source,/wallTimeP95 wallTimeP99/u);
 assert.match(source,/const p95=wallTimeP95Us\/1000/u);
 assert.match(source,/CANARY_P95_BASELINE_LATENCY_REGRESSION/u);
 assert.match(source,/x\.worker_wall_time_p95_ms<=baselineP95Ms/u);
 assert.match(source,/errors\/requests<0\.001/u);
 assert.match(source,/ratio<0\.001/u);
 assert.match(source,/CANARY_D1_140K_PROVIDER_BREACH/u);
 assert.match(source,/CANARY_PROVIDER_SAMPLE_FLOOR_UNMET/u);
});
test('any runtime failure returns traffic fully to baseline, does not unhold remote main',()=>{
 assert.match(source,/await deployBaseline\(base\)/u);
 assert.match(source,/verifyDistribution\(result,versions\)/u);
 assert.match(source,/CANARY_ROLLBACK_PROVIDER_CONFIRMATION_FAILED/u);
 assert.match(source,/remote_main_hold_not_removed:true/u);
 assert.match(source,/config\/d1-hotspot-v2-canary\.hold/u);
 assert.match(workflow,/environment: production/u);
 assert.match(workflow,/cancel-in-progress: false/u);
 assert.doesNotMatch(workflow,/continue-on-error: true/u);
});

test('owner Cloudflare $5 account-wide 5800/hour read and write trajectory is enforced',()=>{
 assert.match(source,/const D1_MAX_OBSERVED_HOURLY_ROWS=5800/u);
 assert.match(source,/read\*3600000\/ms/u);
 assert.match(source,/written\*3600000\/ms/u);
 assert.match(source,/CANARY_D1_HOURLY_5800_BURN_SPIKE/u);
 assert.match(source,/CANARY_D1_HOURLY_PACE_UNVERIFIED/u);
 assert.match(source,/provider_metrics_delayed:true/u);
 assert.match(source,/await deployBaseline\(base\)/u);
});
