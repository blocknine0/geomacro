import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const workflow=name=>readFileSync(new URL("../../.github/workflows/"+name,import.meta.url),"utf8");
test("five minute producer reuses its own runner for quota admission and gates subsequent signer and review",()=>{
 const s=workflow("five-minute-original-news-fastlane.yml");
 const producer=s.slice(s.indexOf("  original-five-minute-derived-news:"));
 const downstream=s.slice(s.indexOf("  continue-private-source-review:"),s.indexOf("  fastlane-contract:"));
 assert.match(producer,/id: budget/);
 assert.match(producer,/run: node scripts\/ops\/plan-d1-bundled-work\.mjs/);
 assert.match(producer,/quota_admitted: \$\{\{ steps\.budget\.outputs\.critical \}\}/);
 assert.match(producer,/if: steps\.budget\.outputs\.critical == 'true'/);
 assert.match(producer,/steps\.budget\.outputs\.critical == 'true' && !cancelled\(\)/);
 assert.match(producer,/if: always\(\) && steps\.budget\.outputs\.critical == 'true'/);
 assert.match(downstream,/needs\.original-five-minute-derived-news\.outputs\.quota_admitted == 'true'/);
 assert.ok(producer.indexOf("id: budget")<producer.indexOf("id: wakeup"));
 assert.ok(producer.indexOf("id: budget")<producer.indexOf("bun scripts/ops/publish-original-news-five-minute-fastlane.ts"));
});
test("30-minute original pulse does not invoke D1 checkpoint or readback after a held tick",()=>{
 const s=workflow("three-domain-30m-original-publisher-pulse.yml");
 const body=s.slice(s.indexOf("  original-publisher-pulse:"),s.indexOf("  private-scoring-from-new-originals:"));
 assert.match(s,/source-contract:\n[\s\S]*?if: github\.event_name == 'pull_request' \|\| github\.event_name == 'push'/);
 assert.match(body,/always\(\) &&[\s\S]*?needs\.source-contract\.result == 'skipped'/);
 assert.match(body,/id: budget/);
 assert.match(body,/if: steps\.budget\.outputs\.research == 'true'/);
 assert.match(body,/if: always\(\) && steps\.budget\.outputs\.research == 'true'/);
 assert.match(body,/run: node scripts\/ops\/plan-d1-bundled-work\.mjs/);
 assert.ok(body.indexOf("id: budget")<body.indexOf("probe-30min-three-domain-pulse.mjs"));
 assert.ok(body.indexOf("id: budget")<body.indexOf("write-30min-source-pulse-d1.mjs"));
});
test("hourly recovery dispatch and material review inherit actual admitted source-budget state",()=>{
 const s=workflow("auto-ingest-news.yml");
 const hourly=s.slice(s.indexOf("  ingest-supabase-free-derived-news:"),s.indexOf("  material-gri-derived-review:"));
 assert.match(hourly,/environment: production/);
 assert.match(s,/quota_admitted: \$\{\{ steps\.budget\.outputs\.research \}\}/);
 assert.match(s,/if: steps\.budget\.outputs\.research == 'true' && steps\.decide\.outputs\.should_run == 'true'/);
 assert.match(s,/needs\.ingest-supabase-free-derived-news\.outputs\.quota_admitted == 'true'/);
});
test("graphQL metering never becomes billed SQL admission and day-shaping is explicitly bounded",()=>{
 const s=readFileSync(new URL("../ops/plan-d1-bundled-work.mjs",import.meta.url),"utf8");
 assert.match(s,/readCloudflareD1AccountQuota/);
 assert.match(s,/d1LanePacedCeiling/);
 assert.match(s,/admission_paced_to_utc_day:true/);
 assert.match(s,/read_reserve:750_000,write_reserve:15_000/);
 assert.match(s,/read_opening_burst:1_000_000,write_opening_burst:10_000/);
});
