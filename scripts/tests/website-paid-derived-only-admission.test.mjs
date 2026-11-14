import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {planD1BundledWork,admitPaidCanonicalReadOnlyCatchup} from "../ops/plan-d1-bundled-work.mjs";
import {D1_FREE_DAILY} from "../ops/audit-d1-account-daily-quota-readonly.mjs";
import {WORKERS_PAID_PROOF_SCHEMA} from "../lib/cloudflare-workers-paid-plan-proof.mjs";

const now=new Date("2026-11-08T23:00:00.000Z");
const snapshot=(rowsRead,rowsWritten)=>({
 schema:"geomacro.d1-account-daily-quota-readonly.v1",
 day_utc:"2026-11-08",provider_graphql_usage_observed:true,
 observed_rows_read:rowsRead,observed_rows_written:rowsWritten,
 limits:{...D1_FREE_DAILY},
 remaining_rows_read:Math.max(0,D1_FREE_DAILY.rows_read-rowsRead),
 remaining_rows_written:Math.max(0,D1_FREE_DAILY.rows_written-rowsWritten)
});
const paidProof={
 schema:WORKERS_PAID_PROOF_SCHEMA,verified:true,
 source:"CLOUDFLARE_ACCOUNT_SUBSCRIPTIONS_BILLING_READ",
 observed_at:now.toISOString(),subscription_changed:false,
 billing_action_performed:false
};
test("Paid original intake reserves a bounded separate derived lane, not general research",()=>{
 const p=planD1BundledWork(snapshot(3587497,396308),{now,paidProof});
 assert.equal(p.state,"CRITICAL_ONLY");
 assert.equal(p.critical,true);
 assert.equal(p.research,false);
 assert.equal(p.maintenance,false);
 assert.equal(p.source_intake,true);
 assert.equal(p.phase2h_raw_archive,true);
 assert.equal(p.paid_derived_news_source_lane,true);
 assert(Number.isSafeInteger(p.paid_derived_news_max_rows));
 assert(p.paid_derived_news_max_rows>=3&&p.paid_derived_news_max_rows<=30);
 assert.equal(p.paid_capacity_verified_by_provider,true);
 assert.equal(p.source_intake_does_not_admit_signing_or_audits,true);
});
test("unknown Paid, Free, high writes, and stale UTC day cannot unlock derived D1",()=>{
 const s=snapshot(3587497,396308);
 for(const [q,options] of [
  [s,{now}],
  [s,{now,paidProof:{...paidProof,verified:false}}],
  [s,{now,paidProof:{...paidProof,observed_at:"2026-11-07T00:00:00Z"}}],
  [snapshot(3587497,1099800),{now,paidProof}],
  [{...s,day_utc:"2026-11-07"},{now,paidProof}]
 ]){
  const p=planD1BundledWork(q,options);
  assert.notEqual(p.paid_derived_news_source_lane,true);
  assert.notEqual(p.research,true);
 }
});
test("same archival writer requires separate Paid monthly PASS before D1 and falls back to static",()=>{
 const wf=readFileSync(".github/workflows/website-derived-news-continuity.yml","utf8");
 const job=wf.split("  archive-only-when-d1-held:")[1].split("  refresh-derived-news:")[0];
 for(const text of [
   "needs.quota-admission.outputs.research == 'false'",
   "needs.quota-admission.outputs.paid_derived_news_source_lane == 'true'",
   "node scripts/ops/check-d1-paid-monthly-headroom.mjs --check",
   'echo "admitted=false" >> "$GITHUB_OUTPUT"',
   "CLOUDFLARE_BILLING_READ_TOKEN:",
   "GEOMACRO_DERIVED_ARCHIVE_ONLY:",
   "GEOMACRO_PAID_DERIVED_ONLY:",
   "GEOMACRO_COMMERCE_LEDGER_TOKEN:",
   "bun scripts/ops/publish-website-derived-news.ts"
 ])assert(job.includes(text),text);
 assert(!job.includes("continue-on-error: true"));
 assert(!job.includes("wrangler d1 execute"));
});
test("source-only publisher strictly bounds three categories and never unlocks commerce",()=>{
 const publisher=readFileSync("scripts/ops/publish-website-derived-news.ts","utf8");
 const planner=readFileSync("scripts/ops/plan-d1-bundled-work.mjs","utf8");
 for(const phrase of [
  'process.env.GEOMACRO_PAID_DERIVED_ONLY === "1"',
  'process.env.GEOMACRO_SOURCE_INTAKE_ADMISSION!=="true"',
  "PAID_SOURCE_MAX_ROWS<3||PAID_SOURCE_MAX_ROWS>30",
  "const perCategory=Math.ceil(PAID_SOURCE_MAX_ROWS/3)",
  "signals=partition.admit.slice(0,bounded)",
  "paidSourceRowsRemaining-=signals.length",
  "archiveCandidateSignals.push(...partition.admit.slice(signals.length))",
  "commercial_authorized:false",
  "normal_research_authorized:false"
 ])assert(publisher.includes(phrase),phrase);
 assert(planner.includes("paid_derived_news_source_lane:sourceIntake&&archive"));
 assert(planner.includes("String(result.paid_derived_news_source_lane===true)"));
 assert(planner.includes("paid_derived_news_max_rows"));
 assert(!planner.includes("research:sourceIntake"));
});

test("read-only Paid canonical public archive catchup survives a write-pacing hold, never a read-cap breach",()=>{
 const at=new Date("2026-11-14T03:35:00.000Z");
 const provider={schema:"geomacro.d1-account-daily-quota-readonly.v1",
  day_utc:"2026-11-14",provider_graphql_usage_observed:true,
  observed_rows_read:719198,observed_rows_written:246401};
 const owner={schema:"geomacro.owner-d1-paid-utc-envelope.v2",
  day_utc:"2026-11-14",held:true,reason:"OWNER_D1_PAID_HOURLY_PACING_HELD",
  observed_rows_read:719198,observed_rows_written:246401,
  normal_daily_rows_read_ceiling:580000000,
  normal_rows_read_remaining:85674235,normal_rows_written_remaining:0};
 const inputs={snapshot:provider,ownerEnvelope:owner,
  paidSubscriptionVerified:true,now:at};
 assert.equal(admitPaidCanonicalReadOnlyCatchup(inputs),true);
 assert.equal(admitPaidCanonicalReadOnlyCatchup({...inputs,
  paidSubscriptionVerified:false}),false);
 assert.equal(admitPaidCanonicalReadOnlyCatchup({...inputs,
  ownerEnvelope:{...owner,normal_rows_read_remaining:754000}}),false);
 assert.equal(admitPaidCanonicalReadOnlyCatchup({...inputs,
  snapshot:{...provider,day_utc:"2026-11-13"}}),false);
 assert.equal(admitPaidCanonicalReadOnlyCatchup({...inputs,
  snapshot:{...provider,provider_graphql_usage_observed:false}}),false);
 assert.equal(admitPaidCanonicalReadOnlyCatchup({...inputs,
  ownerEnvelope:{...owner,observed_rows_read:1}}),false);
 assert.equal(admitPaidCanonicalReadOnlyCatchup({...inputs,
  ownerEnvelope:{...owner,normal_daily_rows_read_ceiling:999999999}}),false);
 assert.equal(admitPaidCanonicalReadOnlyCatchup({...inputs,
  snapshot:{...provider,observed_rows_read:579800000},
  ownerEnvelope:{...owner,observed_rows_read:579800000,
   normal_rows_read_remaining:400000}}),false);
});
test("canonical D1-to-static read-only path needs fresh two-stage Paid proof, never a D1 write approval",()=>{
 const wf=readFileSync(".github/workflows/website-derived-news-continuity.yml","utf8");
 const job=wf.split("  archive-only-when-d1-held:")[1].split("  refresh-derived-news:")[0];
 const planner=readFileSync("scripts/ops/plan-d1-bundled-work.mjs","utf8");
 for(const phrase of [
  "canonical_archive_catchup_readonly:canonicalArchiveReadOnly",
  "canonical_archive_catchup_d1_writes_authorized:false",
  "canonical_archive_catchup_max_rows:canonicalArchiveReadOnly?601:0",
  "snapshot:quota,ownerEnvelope,paidSubscriptionVerified,now",
  "String(result.canonical_archive_catchup_readonly===true)"
 ])assert(planner.includes(phrase),phrase);
 for(const phrase of [
  "canonical_archive_catchup_readonly: ${{ steps.budget.outputs.canonical_archive_catchup_readonly }}",
  "needs.quota-admission.outputs.canonical_archive_catchup_readonly == 'true'",
  "steps.canonical-readonly-monthly.outputs.admitted == 'true'",
  "node scripts/ops/check-d1-paid-monthly-headroom.mjs --check",
  "GEOMACRO_CANONICAL_D1_CATCHUP:",
  "GEOMACRO_COMMERCE_LEDGER_TOKEN:"
 ])assert(wf.includes(phrase),phrase);
 assert(job.indexOf("id: canonical-readonly-monthly")<
  job.indexOf("node scripts/ops/publish-permanent-derived-news-archive.mjs"));
 assert(!job.includes("continue-on-error: true"));
 assert(!job.includes("wrangler d1 execute"));
 assert(!job.includes("secret put"));
 assert(job.includes("needs.quota-admission.outputs.research == 'false'"));
 assert(job.includes("GEOMACRO_PAID_DERIVED_ONLY"));
 const worker=readFileSync("workers/control-plane/src/website-derived-intelligence.mjs","utf8");
 assert.match(worker,/export async function readDerivedStoriesBundle/u);
 assert.match(worker,/LIMIT 601/u);
 const handler=readFileSync("workers/control-plane/src/index.mjs","utf8");
 assert.match(handler,/readDerivedStoriesBundle\(env,Date\.now\(\),false\)/u);
 assert.match(handler,/X-GeoMacro-Origin-Readback/u);
});
