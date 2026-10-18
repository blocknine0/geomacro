import {describe,it,expect} from "vitest";
import {readFileSync} from "node:fs";
import {recognizeDegradedOfficialMeshObservation} from "../../scripts/lib/scheduled-official-mesh-observation.mjs";
const categories=["geopolitics","macro","rare_earth"].map(category=>({
  category,sampled_original_issuer_count:4,active_original_issuer_count:3,
  original_topics_within_24h:0,article_country_relevance_verified:false,
  article_commercial_rights_verified:false,current_scored_event_verified:false,
}));
const proof=()=>({
  status:"ACTIVE_OFFICIAL_ISSUERS_DEGRADED",
  active_source_count:15,quarantined_not_polled:3,
  active_transport_failures:1,original_events_qualified_for_scoring:0,
  commercial_eligible:false,categories,
});
const observe=(data:unknown,code=3)=>recognizeDegradedOfficialMeshObservation({
  code,stdout:JSON.stringify(data)+"\n",
});
describe("quota-governed publisher audit degradation",()=>{
  it("accepts only genuine exit 3 with all 3 verified red category observations",()=>{
    expect(observe(proof())).toEqual({
      observed:true,source_transport_healthy:false,
      active_transport_failures:1,original_events_qualified_for_scoring:0,
      commercial_eligible:false,source_status:"degraded",
    });
    expect(observe(proof(),0)).toBeNull();
    expect(observe(proof(),1)).toBeNull();
  });
  it("never promotes rights, scored data or unknown/missing domains",()=>{
    for(const wrong of [
      {status:"ACTIVE_OFFICIAL_ISSUERS_HEALTHY"},
      {commercial_eligible:true},
      {original_events_qualified_for_scoring:1},
      {active_transport_failures:0},
      {active_source_count:14},
      {quarantined_not_polled:2},
      {categories:categories.slice(0,2)},
      {categories:categories.map((x,i)=>i?x:{...x,article_commercial_rights_verified:true})},
      {categories:categories.map((x,i)=>i?x:{...x,current_scored_event_verified:true})},
      {categories:categories.map((x,i)=>i?x:{...x,original_topics_within_24h:-1})},
    ])expect(observe({...proof(),...wrong})).toBeNull();
    expect(recognizeDegradedOfficialMeshObservation({code:3,stdout:"<publisher html>"})).toBeNull();
  });
  it("does not mask a task failure or a stale current signed GRI",()=>{
    const orchestrator=readFileSync("scripts/intelligence-orchestrator.mjs","utf8");
    const workflow=readFileSync(".github/workflows/intelligence-orchestrator.yml","utf8");
    const pulse=readFileSync(".github/workflows/three-domain-30m-original-publisher-pulse.yml","utf8");
    const official=orchestrator.slice(orchestrator.indexOf('key: "official_native_rss"'));
    expect(official).toContain("cadenceSeconds: 21600");
    expect(orchestrator).toContain("recognizeDegradedOfficialMeshObservation(result)");
    expect(orchestrator).toContain("source_transport_degraded: observationDegraded");
    expect(orchestrator).toContain('state.cursor.last_error = success ? null : observationDegraded');
    expect(orchestrator).toContain("state.cursor.retry_pending = !result.ok");
    expect(orchestrator).toContain('officialSourcePollCursorOutcome(success)');
    expect(orchestrator).toContain('last_success_at: success ? new Date().toISOString() : null');
    expect(orchestrator).toContain("if (!summary.ok) process.exitCode = 1");
    expect(workflow).toContain('INTELLIGENCE_ORCHESTRATOR_MAX_TASKS: "2"');
    expect(workflow).toContain('B2_ACCOUNT_QUOTA_REQUIRED: "1"');
    expect(workflow).toContain('GEOMACRO_SUPABASE_RESTRICTED_MODE: "true"');
    expect(pulse).toContain('cron: "12,42 * * * *"');
    expect(pulse).toContain('independent_origin_pairs_healthy');
  });
});
