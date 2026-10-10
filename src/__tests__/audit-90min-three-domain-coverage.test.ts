import { describe,expect,it } from "vitest";
import { readFileSync } from "node:fs";
import {assessCadence,latestScheduledSlot,classifyCountryMatrixAggregate} from "../../scripts/ops/audit-90min-three-domain-coverage.mjs";
const at=Date.parse("2026-10-10T09:19:00Z");
const rows=[
 {domain:"geopolitics",readiness_status:"READY",row_count:195,certified_source_cells:150,recent_verified_cells:15,last_verified_at:"2026-10-10T09:03:00.000Z"},
 {domain:"macro",readiness_status:"PARTIAL",row_count:195,certified_source_cells:120,recent_verified_cells:0,last_verified_at:"2026-10-09T10:00:00.000Z"},
 {domain:"critical_minerals",readiness_status:"UNAVAILABLE",row_count:195,certified_source_cells:0,recent_verified_cells:0,last_verified_at:null},
];
const response=(data:unknown[])=>JSON.stringify([{success:true,results:data,meta:{secret:"DO_NOT_LEAK"}}]);
describe("#1827 90m source cadence and no-raw D1 195x3 metadata",()=>{
 it("has 16 exact 90min slots across midnight with explicit scheduler-lag state",()=>{
   const hours=[0,3,6,9,12,15,18,21];
   const slots=hours.map(h=>h*60+17).concat([1,4,7,10,13,16,19,22].map(h=>h*60+47)).sort((a,b)=>a-b);
   expect(slots.length).toBe(16);
   expect(slots.slice(1).map((x,i)=>x-slots[i])).toEqual(Array(15).fill(90));
   expect(1440-slots[15]+slots[0]).toBe(90);
   expect(latestScheduledSlot(at)).toBe(Date.parse("2026-10-10T09:17:00Z"));
   expect(latestScheduledSlot(Date.parse("2026-10-10T00:01:00Z"))).toBe(Date.parse("2026-10-09T22:47:00Z"));
   expect(assessCadence({nowMs:at,eventName:"schedule",
     scheduledCron:"17 0,3,6,9,12,15,18,21 * * *"})).toMatchObject({
     cadence:"NINETY_MINUTES_CONFIGURED",start_lag_minutes:2,
     scheduler_late:false,exactly_on_time_guaranteed:false,
   });
   expect(assessCadence({nowMs:Date.parse("2026-10-10T10:10:00Z"),
     eventName:"schedule",scheduledCron:"17 0,3,6,9,12,15,18,21 * * *"}).scheduler_late).toBe(true);
 });
 it("never promotes 585 metadata rows into current scored/corroborated global coverage",()=>{
   const result=classifyCountryMatrixAggregate(response(rows),{nowMs:at});
   expect(result.target_country_domain_cells).toBe(585);
   expect(result.metadata_matrix_floor_met).toBe(true);
   expect(result.coverage_matrix.geopolitics.metadata_country_cells).toBe(195);
   expect(result.coverage_matrix.macro.certified_source_cells).toBe(120);
   expect(result.coverage_matrix.rare_earth.verified_within_90m_metadata_cells).toBe(0);
   expect(result.current_verified_195x3_risk_intelligence).toBe(false);
   expect(result.rights_corroboration_and_signed_gro_verified).toBe(false);
   expect(result.all_new_global_developments_detected).toBe(false);
   expect(result.paid_coverage_accepted).toBe(false);
   expect(result.customer_raw_news_exported).toBe(false);
   expect(result.customer_source_urls_exported).toBe(false);
   expect(JSON.stringify(result)).not.toContain("DO_NOT_LEAK");
 });
 it("retains RED absent domains with no identity/source leakage",()=>{
   const got=classifyCountryMatrixAggregate(response(rows.slice(0,2)),{nowMs:at});
   expect(got.metadata_matrix_floor_met).toBe(false);
   expect(got.coverage_matrix.rare_earth.metadata_country_cells).toBe(0);
   expect(got.d1_writes).toBe(0);
   expect(got.b2_requests).toBe(0);
   expect(JSON.stringify(got)).not.toContain("country_code");
 });
 it("rejects hostile malformed, duplicates, alternative labels and counters",()=>{
   for(const invalid of ["bad","{}",
     JSON.stringify([{success:false,results:rows}]),
     response([...rows,rows[0]]),
     response([{...rows[0],domain:"geopolitical"},...rows]),
     response([{...rows[0],certified_source_cells:196},...rows.slice(1)]),
     response([{...rows[0],readiness_status:"<script>bad</script>"},...rows.slice(1)]),
     response([{...rows[0],row_count:195.5},...rows.slice(1)]),
   ])expect(()=>classifyCountryMatrixAggregate(invalid,{nowMs:at})).toThrow();
   expect(()=>assessCadence({nowMs:at,eventName:"schedule",scheduledCron:"0 * * * *"})).toThrow();
 });
 it("workflow never reads raw country identities or private sources and never writes",()=>{
   const yaml=readFileSync(".github/workflows/expanded-official-source-observation.yml","utf8");
   const code=readFileSync("scripts/ops/audit-90min-three-domain-coverage.mjs","utf8");
   expect(yaml).toContain('cron: "17 0,3,6,9,12,15,18,21 * * *"');
   expect(yaml).toContain('cron: "47 1,4,7,10,13,16,19,22 * * *"');
   expect(yaml).toContain("github.event_name != 'pull_request'");
   expect(yaml).toContain("GROUP BY lower(domain), readiness_status");
   expect(yaml).toContain("--remote --json --command");
   expect(yaml).not.toContain("SELECT *");
   expect(yaml).not.toContain("DELETE FROM");
   expect(yaml).not.toContain("UPDATE country_domain_state");
   expect(yaml).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
   expect(yaml).not.toContain("B2_APPLICATION_KEY");
   expect(code).not.toContain("fetch(");
   expect(code).not.toContain("source_title");
   expect(code).not.toContain("article_body");
   expect(code).not.toContain("country_code");
 });
});