import {describe,it,expect} from "vitest";
import {inventorySupabaseWorkflowJobs} from "../../scripts/ops/inventory-active-supabase-workflows.mjs";
describe("canonical active Supabase workflow execution inventory",()=>{
  const report=inventorySupabaseWorkflowJobs();
  it("enumerates every workflow, including all available job IDs and triggers",()=>{
    expect(report.workflow_file_count).toBeGreaterThanOrEqual(250);
    expect(report.job_entry_count).toBeGreaterThanOrEqual(report.workflow_file_count);
    expect(report.exhaustive_workflow_filenames).toBe(true);
    expect(new Set(report.entries.map(e=>e.workflow_path)).size).toBe(report.workflow_file_count);
  });
  it("does not certify zero Supabase runtime from text scanning or silently activate anything",()=>{
    expect(report.zero_reachable_supabase_dependencies_proven).toBe(false);
    expect(report.exhaustive_runtime_reachability_proven).toBe(false);
    expect(report.suspicious_reachable_job_count).toBeGreaterThan(0);
    expect(report.no_new_supabase_connection).toBe(true);
    expect(report.b2_requests).toBe(0);
    expect(report.d1_writes).toBe(0);
    expect(report.x402_payment_attempts).toBe(0);
  });
  it("retains distinct manual, automated and frozen classification with full disclosure",()=>{
    const entries=(name:string)=>report.entries.filter(e=>e.workflow_path.endsWith("/"+name));
    expect(entries("d1-shadow-backfill.yml").some(x=>x.reachability==="FROZEN_STATIC_FALSE")).toBe(true);
    expect(entries("eurostat-government-debt-sync.yml").some(x=>x.reachability==="FROZEN_STATIC_FALSE")).toBe(true);
    expect(entries("telegram-b2-d1-consumer.yml").length).toBeGreaterThan(0);
    expect(entries("world-bank-ppg-global-shadow-census.yml").length).toBeGreaterThan(0);
    expect(report.entries.every(x=>x.production_acceptance_status==="NOT_INFERRED_FROM_SOURCE")).toBe(true);
  });
});
