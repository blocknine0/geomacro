import test from "node:test";
import assert from "node:assert/strict";
import {planD1BundledWork,checkD1BundledWork,d1LanePacedCeiling,PREDGE_D1_FREE_HEADROOM,phase2fQuotaDiagnostic} from "../ops/plan-d1-bundled-work.mjs";
import {D1_FREE_DAILY} from "../ops/audit-d1-account-daily-quota-readonly.mjs";

const now=new Date("2026-10-27T12:00:00.000Z");
const quota=(read,written)=>({
  schema:"geomacro.d1-account-daily-quota-readonly.v1",
  day_utc:"2026-10-27",provider_graphql_usage_observed:true,
  observed_rows_read:read,observed_rows_written:written,
  limits:{...D1_FREE_DAILY},
  remaining_rows_read:Math.max(0,5_000_000-read),
  remaining_rows_written:Math.max(0,100_000-written),
});

test("one account-wide observation decides all three bounded lanes",()=>{
 const p=planD1BundledWork(quota(1_000_000,10_000),{now});
 assert.equal(p.state,"NORMAL");
 assert.equal(p.critical,true);assert.equal(p.research,true);
 assert.equal(p.maintenance,true);
 assert.equal(p.d1_queries,0);assert.equal(p.paid_calls,0);
});
test("paced bundles preserve critical work while research/maintenance yield first",()=>{
 const p=planD1BundledWork(quota(2_100_000,30_000),{now});
 assert.equal(p.state,"CRITICAL_ONLY");
 assert.equal(p.maintenance,false);
 assert.equal(p.research,false);
 assert.equal(p.critical,true);
 const q=planD1BundledWork(quota(3_900_000,50_000),{now});
 assert.equal(q.state,"HELD");
 assert.equal(q.critical,false);
});
test("Phase2H has isolated free-tier archive admission without opening general maintenance",()=>{
 const at=new Date("2026-10-30T14:10:33.000Z");
 // More write headroom is needed when reserving three five-hour slots.
 const observed={...quota(2_441_367,43_000),day_utc:"2026-10-30"};
 const p=planD1BundledWork(observed,{now:at});
 assert.equal(p.state,"HELD");
 assert.equal(p.maintenance,false);
 assert.equal(p.source_intake,true);
 assert.equal(p.phase2h_raw_archive,true);
 assert.equal(p.phase2h_raw_archive_does_not_admit_general_maintenance,true);
 assert.equal(p.phase2h_raw_archive_requires_atomic_b2_quota,true);
 assert.equal(p.phase2h_raw_archive_max_rows_per_slot,300);
 assert.equal(p.research,false);
 assert.equal(p.paid_calls,0);
 const hours=Math.ceil((86_400_000-(at.getTime()%86_400_000))/(5*3_600_000))+1;
 const slots=hours;
 assert.ok(p.remaining_rows_read>
   1_250_000+p.source_intake_budget_to_utc_reset.rows_read+
   slots*20_000+hours*2500+10_000);
 assert.ok(p.remaining_rows_written>
   23_000+p.source_intake_budget_to_utc_reset.rows_written+
   slots*350+hours*p.retention_cleanup_max_rows+150);
});
test("Phase2H archive stays closed on denied or insufficient provider headroom",()=>{
 const at=new Date("2026-10-30T14:10:33.000Z");
 for(const [read,written] of [[4_000_000,50_171],[2_441_367,51_000],
                               [2_441_367,90_000],[5_000_000,100_000]]) {
  const q=planD1BundledWork({...quota(read,written),day_utc:"2026-10-30"},{now:at});
  assert.equal(q.phase2h_raw_archive,false);
 }
 assert.equal(planD1BundledWork(null,{now:at}).phase2h_raw_archive,false);
 assert.equal(planD1BundledWork({...quota(100,100),day_utc:"2026-10-29"},{now:at}).phase2h_raw_archive,false);
});
test("write reserve stops discretionary lanes before daily write cap",()=>{
 const q=planD1BundledWork(quota(1_000,40_000),{now});
 assert.equal(q.state,"CRITICAL_ONLY");
 assert.equal(q.critical,true);
 assert.equal(q.research,false);
 assert.equal(q.maintenance,false);
 assert.equal(planD1BundledWork(quota(1000,86_000),{now}).state,"HELD");
});
test("stale partial impossible or forged counter state cannot authorize D1",()=>{
 for(const a of [
   {...quota(2,1),day_utc:"2026-10-26"},
   {...quota(2,1),remaining_rows_read:5_000_000},
   {...quota(2,1),provider_graphql_usage_observed:false},
   {...quota(2,1),observed_rows_read:-1},
   {...quota(2,1),limits:{rows_read:50_000_000,rows_written:100_000}},
   null,
 ]){
  const p=planD1BundledWork(a,{now});
  assert.equal(p.state,"HELD");
  assert.equal(p.critical,false);
 }
});
test("UTC paced watermarks bound early-day spikes without paying or minting new requests",()=>{
 const morning=new Date("2026-10-27T06:45:00.000Z");
 const early=planD1BundledWork(quota(1_720_587,17_836),{now:morning});
 assert.equal(early.state,"CRITICAL_ONLY");
 assert.equal(early.critical,true);
 assert.equal(early.research,false);
 assert.equal(early.maintenance,false);
 assert.equal(early.admission_paced_to_utc_day,true);
 const mid=planD1BundledWork(quota(2_900_000,50_000),{now});
 assert.equal(mid.state,"HELD");
 const start=d1LanePacedCeiling("critical",new Date("2026-10-27T00:00:00.000Z"));
 const finish=d1LanePacedCeiling("critical",new Date("2026-10-27T23:59:59.999Z"));
 assert.equal(start.rows_read,1_000_000);
 assert.equal(start.rows_written,10_000);
 assert.ok(finish.rows_read<3_750_000 && finish.rows_read>3_749_900);
 assert.ok(finish.rows_written<77_000 && finish.rows_written>76_990);
 assert.ok(d1LanePacedCeiling("maintenance",morning).rows_read<
   d1LanePacedCeiling("research",morning).rows_read);
});

test("disposable read-saver continues only with 250k/5k account safety reserve",()=>{
 const q=planD1BundledWork(quota(4_145_068,23_531),{now});
 assert.equal(q.critical,false);
 assert.equal(q.source_intake,false);
 assert.equal(q.snapshot_refresh,true);
 assert.equal(q.structural_snapshot,true);
 assert.equal(q.structural_snapshot_max_b2_network_attempts,12);
 assert.equal(q.structural_snapshot_requires_atomic_b2_account_reservation,true);
 assert.equal(q.snapshot_refresh_does_not_admit_ingestion,true);
 assert.equal(q.snapshot_refresh_max_source_rows_per_run,601);
 for(const [r,w] of [[4_345_068,23_531],[4_750_001,23_531],[4_700_000,95_001],
                     [5_000_000,0],[1_000,99_999]]){
  assert.equal(planD1BundledWork(quota(r,w),{now}).snapshot_refresh,false);
 }
 assert.equal(planD1BundledWork(null,{now}).snapshot_refresh,false);
 assert.equal(planD1BundledWork(null,{now}).structural_snapshot,false);
 assert.equal(planD1BundledWork(quota(4_750_001,0),{now}).structural_snapshot,false);
 assert.equal(planD1BundledWork(quota(1_000,99_999),{now}).structural_snapshot,false);
});
test("provider error or denied GraphQL is safe HOLD with no writes",async()=>{
 const x=await checkD1BundledWork({
   env:{CLOUDFLARE_API_TOKEN:"x".repeat(24),CLOUDFLARE_ACCOUNT_ID:"a".repeat(32)},
   fetchImpl:async()=>({ok:false}),
   now,
 });
 assert.equal(x.state,"HELD");
 assert.equal(x.reason,"D1_ACCOUNT_QUOTA_PROBE_FAILED");
 assert.equal(x.d1_rows_written,0);
});
test('observed production pacing hold still admits only a full-day budgeted small source bundle',()=>{
 const at=new Date('2026-10-27T09:17:28.000Z');
 const result=planD1BundledWork(quota(2825556,21330),{now:at});
 assert.equal(result.critical,false);assert.equal(result.research,false);assert.equal(result.maintenance,false);
 assert.equal(result.source_intake,true);
 const budget=result.source_intake_budget_to_utc_reset;
 assert.ok(budget.rows_read<=3200*288+100000);assert.ok(budget.rows_written<result.remaining_rows_written-15000);
 assert.ok(result.remaining_rows_read-budget.rows_read>750000+PREDGE_D1_FREE_HEADROOM.rows_read);
 assert.ok(result.remaining_rows_written-budget.rows_written>15000+PREDGE_D1_FREE_HEADROOM.rows_written);
 assert.equal(result.source_intake_does_not_admit_signing_or_audits,true);
});
test('PREDGE protected pool wins over late-day source intake on Free D1',()=>{
 const at=new Date('2026-10-27T10:18:57Z');
 const incident=planD1BundledWork(quota(3871312,22960),{now:at});
 assert.equal(incident.source_intake,false);
 assert.equal(incident.critical,false);
 assert.equal(incident.predge_account_headroom_guard_enabled,true);
 assert.equal(incident.predge_request_governor_is_separate_and_unchanged,true);
 assert.deepEqual(incident.predge_account_headroom_planning_reserve,
   PREDGE_D1_FREE_HEADROOM);
 assert.equal(incident.predge_account_headroom_is_hard_partition,false);
 const safe=planD1BundledWork(quota(2800000,22960),{now:at});
 assert.equal(safe.source_intake,true);
 const b=safe.source_intake_budget_to_utc_reset;
 assert.ok(safe.remaining_rows_read-b.rows_read>
   750000+PREDGE_D1_FREE_HEADROOM.rows_read);
 assert.ok(safe.remaining_rows_written-b.rows_written>
   15000+PREDGE_D1_FREE_HEADROOM.rows_written);
});
test('fixed PREDGE account reserve is additive for every GeoMacro Free admission lane',()=>{
 assert.equal(PREDGE_D1_FREE_HEADROOM.rows_read,500000);
 assert.equal(PREDGE_D1_FREE_HEADROOM.rows_written,8000);
 assert.equal(PREDGE_D1_FREE_HEADROOM.pilot_request_cap_per_utc_day,500);
 const at=new Date('2026-10-27T23:59:59Z');
 for(const [lane,expectedReadReserve,expectedWriteReserve] of [
   ['critical',1250000,23000],['research',2000000,38000],
   ['maintenance',3000000,58000]]){
   const max=d1LanePacedCeiling(lane,at);
   assert.ok(max.rows_read>5000000-expectedReadReserve-100);
   assert.ok(max.rows_read<=5000000-expectedReadReserve);
   assert.ok(max.rows_written<=100000-expectedWriteReserve);
 }
 for(const [read,write] of [[4251000,1000],[1000,92500],[4350000,93000]]){
   const q=planD1BundledWork(quota(read,write),{now:at});
   assert.equal(q.snapshot_refresh,false);
   assert.equal(q.source_intake,false);
 }
 const q=planD1BundledWork(quota(100,100),{now:at});
 assert.equal(q.predge_account_headroom_is_hard_partition,false);
 assert.equal(q.predge_account_headroom_guard_enabled,true);
 assert.equal(q.predge_request_governor_is_separate_and_unchanged,true);
 assert.equal(q.d1_queries,0);
 assert.equal(q.paid_calls,0);
});
test('bounded source intake cannot consume the protected reserve or use unknown quota counters',()=>{
 for(const [read,written]of [[4300000,10000],[1000,86000],[5000000,100000]])assert.equal(planD1BundledWork(quota(read,written),{now}).source_intake,false);
 assert.equal(planD1BundledWork(null,{now}).source_intake,false);
 assert.equal(planD1BundledWork({...quota(1000,100),day_utc:'2026-10-26'},{now}).source_intake,false);
});


test('live 13:19 UTC CONSERVE keeps original intake and protected EIA/NOAA measurement',()=>{
 const at=new Date('2026-10-29T13:19:46.000Z');
 const s={...quota(1_509_065,32_136),day_utc:'2026-10-29'};
 const result=planD1BundledWork(s,{now:at});
 assert.equal(result.state,'CONSERVE');
 assert.equal(result.maintenance,false);
 assert.equal(result.source_intake,true);
 assert.equal(result.governed_measurement,true);
 assert.equal(result.governed_measurement_extra_read_budget,25_000);
 assert.equal(result.governed_measurement_extra_write_budget,500);
 assert.equal(result.governed_measurement_no_signing_or_payments,true);
 const a=result.source_intake_budget_to_utc_reset;
 assert.ok(result.remaining_rows_read-a.rows_read-25_000 >
   750_000+PREDGE_D1_FREE_HEADROOM.rows_read);
 assert.ok(result.remaining_rows_written-a.rows_written-500 >
   15_000+PREDGE_D1_FREE_HEADROOM.rows_written);
 assert.equal(result.paid_calls,0);
 assert.equal(result.b2_requests,0);
 assert.equal(result.d1_queries,0);
});

test('optional governed measurement yields to PREDGE, future source intake, stale and unverified quota',()=>{
 for(const [read,written] of [
  [4_300_000,10_000],[1_509_065,74_000],[1_509_065,80_000],[4_990_000,99_000],
  [5_000_000,100_000],
 ]) {
  const at=new Date('2026-10-29T13:19:46.000Z');
  const p=planD1BundledWork({...quota(read,written),day_utc:'2026-10-29'},{now:at});
  assert.equal(p.governed_measurement,false,JSON.stringify([read,written]));
 }
 const at=new Date('2026-10-29T13:19:46.000Z');
 assert.equal(planD1BundledWork(null,{now:at}).governed_measurement,false);
 assert.equal(planD1BundledWork({
  ...quota(1_000_000,1_000),day_utc:'2026-10-28',
 },{now:at}).governed_measurement,false);
});

test("Phase 2F classifies verified live reserve-exhaustion without falsifying physical D1 exhaustion",()=>{
 const time=new Date("2026-10-29T22:26:08.788Z");
 const snapshot={...quota(4_348_180,66_839),day_utc:"2026-10-29"};
 const original=planD1BundledWork(snapshot,{now:time});
 const receipt=phase2fQuotaDiagnostic(original);
 assert.equal(original.state,"HELD");
 assert.equal(original.critical,false);
 assert.equal(original.source_intake,false);
 assert.equal(receipt.cause,"PROTECTED_CRITICAL_AND_PREDGE_RESERVE_HELD");
 assert.equal(receipt.physical_free_limit_reached,false);
 assert.equal(receipt.protected_critical_predge_reserve_held,true);
 assert.equal(receipt.utc_critical_pacing_held,true);
 assert.equal(receipt.remaining_rows_read,651_820);
 assert.equal(receipt.remaining_rows_written,33_161);
 assert.equal(receipt.critical_read_reserve_shortfall,598_181);
 assert.equal(receipt.critical_write_reserve_shortfall,0);
 assert.equal(receipt.predge_read_reserve_unchanged,500_000);
 assert.equal(receipt.predge_write_reserve_unchanged,8_000);
 assert.equal(receipt.derived_three_category_d1_publisher_admitted,false);
 assert.equal(receipt.bounded_original_intake_admitted,false);
 assert.equal(receipt.extra_d1_reads,0);
 assert.equal(receipt.d1_writes,0);
 assert.equal(receipt.payments,0);
});
test("Phase 2F distinguishes physical stop, UTC pacing, source-only admission and publisher allowance",()=>{
 const time=new Date("2026-10-27T12:00:00Z");
 const physical=phase2fQuotaDiagnostic(planD1BundledWork(quota(5_000_000,100_000),{now:time}));
 assert.equal(physical.cause,"PHYSICAL_FREE_LIMIT_REACHED");
 assert.equal(physical.physical_free_limit_reached,true);
 const paced=phase2fQuotaDiagnostic(planD1BundledWork(quota(3_749_900,50_000),{now:time}));
 assert.equal(paced.cause,"UTC_DAILY_PACING_HELD");
 assert.equal(paced.protected_critical_predge_reserve_held,false);
 const source=phase2fQuotaDiagnostic(planD1BundledWork(quota(2_825_556,21_330),{now:new Date("2026-10-27T09:17:28Z")}));
 assert.equal(source.cause,"BOUNDED_ORIGINAL_SOURCE_INTAKE_ONLY");
 assert.equal(source.bounded_original_intake_admitted,true);
 assert.equal(source.derived_three_category_d1_publisher_admitted,false);
 const full=phase2fQuotaDiagnostic(planD1BundledWork(quota(1_000_000,10_000),{now:time}));
 assert.equal(full.cause,"THREE_CATEGORY_DERIVED_PUBLISHER_ADMITTED");
 assert.equal(full.derived_three_category_d1_publisher_admitted,true);
});
test("Phase 2F unverified provider counters fail closed without inventing usage",()=>{
 for(const state of [null,planD1BundledWork(null,{now})]){
  const output=phase2fQuotaDiagnostic(state);
  assert.equal(output.status,"PROVIDER_COUNTERS_UNVERIFIED");
  assert.equal(output.cause,"PROVIDER_USAGE_UNVERIFIED");
  assert.equal(output.observed_rows_read,null);
  assert.equal(output.physical_free_limit_reached,null);
  assert.equal(output.derived_three_category_d1_publisher_admitted,false);
  assert.equal(output.publication_verified,false);
 }
});


test("actual 30 Oct provider-paced source-only snapshot can reserve 25 Phase2H deletes/hour independently",()=>{
 const at=new Date("2026-10-30T13:43:32.000Z");
 const live={...quota(2_311_316,49_693),day_utc:"2026-10-30"};
 const p=planD1BundledWork(live,{now:at});
 assert.equal(p.critical,false);
 assert.equal(p.source_intake,true);
 assert.equal(p.retention_cleanup,true);
 assert.ok(p.retention_cleanup_max_rows>=25);
 assert.ok(p.retention_cleanup_max_rows<=1000);
 assert.ok(p.retention_cleanup_max_rows*4+150+
   p.source_intake_budget_to_utc_reset.rows_written+23000<
   live.remaining_rows_written);
 assert.equal(p.retention_cleanup, p.retention_cleanup_max_rows>0);
 assert.equal(p.retention_cleanup_only_phase2h_original_news,true);
 assert.equal(p.retention_cleanup_does_not_admit_research_or_signing,true);
 assert.equal(p.research,false);
 assert.equal(p.maintenance,false);
 assert.equal(p.d1_queries,0);
 assert.equal(p.d1_rows_written,0);
 const marginal={...quota(2_311_316,50_000),day_utc:"2026-10-30"};
 const held=planD1BundledWork(marginal,{now:at});
 assert.equal(held.source_intake,true);
 assert.ok(held.retention_cleanup_max_rows<=1000);
 assert.equal(held.retention_cleanup,held.retention_cleanup_max_rows>0);
 for(const bad of [null,{...live,provider_graphql_usage_observed:false}]){
  const x=planD1BundledWork(bad,{now:at});
  assert.equal(x.retention_cleanup,false);
 }
});

test("Phase2H cleanup grant always spends only provider-budgeted five-hour rows",()=>{
 const at=new Date("2026-10-30T13:43:32.000Z");
 for(const written of [49_693,50_000,55_000,70_000,95_000]){
  const snap={...quota(2_311_316,written),day_utc:"2026-10-30"};
  const p=planD1BundledWork(snap,{now:at});
  const cap=p.retention_cleanup_max_rows;
  assert.ok(Number.isSafeInteger(cap)&&cap>=0&&cap<=1000);
  if(p.retention_cleanup){
   assert.ok(cap>=25);
   const slots=Math.ceil((86_400_000-(at.getTime()%86_400_000))/(5*3600000))+1;
   const reserved=23000+(p.source_intake_budget_to_utc_reset?.rows_written??0)+150+
     cap*slots;
   assert.ok(snap.remaining_rows_written>reserved);
  }else assert.equal(cap,0);
 }
});
