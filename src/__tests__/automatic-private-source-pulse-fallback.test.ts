import {readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";

const pulse=readFileSync(".github/workflows/three-domain-30m-original-publisher-pulse.yml","utf8");
const restricted=readFileSync(".github/workflows/restricted-private-current-scoring.yml","utf8");
const scorer=readFileSync("scripts/lib/official-native-rss.mjs","utf8");

describe("resilient free scheduled original-source pulse to SHA-bound private scorer",()=>{
  it("retains original cron but accepts ONLY successful scheduled first-party intake as fallback wakeup",()=>{
    expect(pulse).toContain('cron: "12,42 * * * *"');
    expect(pulse).toContain('workflows: ["Three-Domain Unified Private Source Intake"]');
    expect(pulse).toContain("types: [completed]");
    expect(pulse).toContain("github.event_name != 'pull_request'");
    expect(pulse).toContain("github.event.workflow_run.conclusion == 'success'");
    expect(pulse).toContain("github.event.workflow_run.event == 'schedule'");
    expect(pulse).toContain("github.event.workflow_run.head_branch == 'main'");
    expect(pulse).toContain("github.event.workflow_run.head_repository.full_name == 'blocknine0/geomacro'");
    expect(pulse).toContain("github.repository == 'blocknine0/geomacro'");
    expect(pulse).toContain("github.ref == 'refs/heads/main'");
    expect(pulse).toContain("cancel-in-progress: true");
    expect(pulse).not.toContain("repository_dispatch:");
    expect(pulse).not.toContain("pull_request_target:");
  });
  it("automatically scores only after the D1 readback proves newly observed URL SHA refs",()=>{
    expect(pulse).toContain("private_scoring_needed: ${{ steps.d1.outputs.private_scoring_needed }}");
    expect(pulse).toContain("needs.original-publisher-pulse.outputs.private_scoring_needed == 'true'");
    expect(pulse).toContain("bounded_automatic_private_stage: true");
    expect(pulse).toContain("node scripts/lib/auto-private-scoring-trigger.mjs");
    expect(restricted).toContain(
      'GEOMACRO_AUTOMATIC_D1_PULSE_STAGE: ${{ inputs.bounded_automatic_private_stage == true }}',
    );
    expect(scorer).toContain('process.env.GEOMACRO_AUTOMATIC_D1_PULSE_STAGE==="true"');
    expect(scorer).toContain('process.env.GITHUB_REPOSITORY==="blocknine0/geomacro"');
    expect(scorer).toContain('process.env.GITHUB_REF==="refs/heads/main"');
    expect(scorer).toContain('throw Error("PRIVATE_PULSE_AUTO_CONTEXT_UNVERIFIED")');
    expect(scorer).toContain('pipeline:"official_source_pulse_30m"');
    expect(scorer).toContain("selectPrivateNovelPulseRefs(snapshot,category,now.getTime())");
    expect(scorer).toContain("expectedClocks");
    expect(scorer).toContain("fetchPulseRotatedPrivateOriginals");
    expect(scorer).toContain("privateOriginalMatchesPulse(");
    expect(scorer).toContain("if(refs.size===0)return []");
    expect(scorer).not.toContain('process.env.GITHUB_EVENT_NAME==="schedule"');
  });
  it("never authorizes payment, sourced raw publications, or B2 snapshot promotion",()=>{
    expect(restricted).toContain("GEOMACRO_GDELT_ONLY: \"true\"");
    expect(pulse).toContain("publisher_rights_verified==false");
    expect(pulse).toContain(".independently_verified_current_intelligence_count==0");
    expect(pulse).toContain(".supabase_requests==0 and .payments_performed==0");
    expect(pulse).toContain(".b2_reads==0 and .b2_writes==0 and .d1_writes==0");
    for(const forbidden of ["settleCoinbaseX402", "payment_required_now:true", "raw_original_payload_public:true"])
      expect(scorer).not.toContain(forbidden);
  });
});
