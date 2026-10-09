import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { summarizePublicIntelligenceFreshness } from "../../scripts/lib/public-intelligence-freshness-audit.mjs";

const hashA = "a".repeat(64);
const hashB = "b".repeat(64);
const now = Date.parse("2026-10-09T11:15:00Z");
function fixture(edgeHash = hashA, overlayHash = hashA) {
  const at = "2026-10-09T11:00:00Z";
  const observed = {
    id:"native-observation-1", source_title:"Geomacro observes a verified policy signal",
    summary:"Monitoring only; not scored", category:"geopolitics",
    severity:null, delta:null, public_status:"live_observed",
    created_at:"2026-10-09T10:30:00Z", published_at:"2026-10-09T10:30:00Z",
  };
  const scoredRows = ["geopolitics", "macro", "rare_earth"].map((category,i)=>({
    id: "scored-" + i,
    source_title: "Geomacro finds verified export controls change procurement exposures",
    summary: "Earlier independently verified assessment",
    category, severity: 65, delta: null,
    created_at: "2026-10-05T19:00:00Z",
    published_at: "2026-10-05T19:00:00Z",
    public_status: "verified_b2",
  }));
  return {
    now,
    edge: {
      status: 200, authority: "backblaze-b2-intelligence-edge",
      b2_sha256: edgeHash, current_overlay:"cloudflare-d1-hot",
      payload: {
        schema:"geomacro.public-intelligence-live.v1",
        source_project:"ldpwajisioljyjtojvfx", rows:[observed,...scoredRows],
      },
    },
    site: {status:200, payload:{ok:true, rows:[observed,...scoredRows],
      mode:"verified_b2_plus_live_observed", newest_at:"2026-10-09T10:30:00Z",
      current_within_24h:true}},
    overlay: {status:200, verified_b2_sha256:overlayHash,
      current_source_batch_at:at, payload:{rows:[observed]}},
  };
}
describe("#1827 production edge worker/website B2-bound D1 overlay convergence", () => {
  it("detects stale edge hash even if Cloudflare D1 overlay and website each return 200",()=>{
    const report=summarizePublicIntelligenceFreshness(fixture(hashA,hashB));
    expect(report.current_overlay_state).toBe("EDGE_BASELINE_AND_D1_OVERLAY_HASH_MISMATCH");
    expect(report.public_site_api_ok).toBe(true);
    expect(report.three_domain_current_scored_ready).toBe(false);
  });
  it("validates independent cache-bound overlay without claiming current category scored records",()=>{
    const report=summarizePublicIntelligenceFreshness(fixture());
    expect(report.current_overlay_state).toBe("D1_CURRENT_OVERLAY_BOUND_TO_B2_VISIBLE");
    for(const category of ["geopolitics","macro","rare_earth"]) {
      expect(report.scored_domains[category].state).toBe("HISTORICAL_VERIFIED");
    }
    expect(report.commercial_payable_ready).toBe(false);
    // The 10:30 original event predates the 11:00 collection batch;
    // exact source-row identity still proves the website has projected it.
    expect(report.site_observed_source_batch).toBe(true);
    expect(report.site_overlay_converged).toBe(true);
  });
  it("fails closed on a site that drops the actual overlay row even when hashes and HTTP status pass",()=>{
    const input=fixture();
    const scoredOnly=input.site.payload.rows.filter(r => r.public_status==="verified_b2");
    const report=summarizePublicIntelligenceFreshness({
      ...input, site:{status:200,payload:{...input.site.payload,rows:scoredOnly}},
    });
    expect(report.current_overlay_state).toBe("D1_CURRENT_OVERLAY_BOUND_TO_B2_VISIBLE");
    expect(report.site_observed_source_batch).toBe(false);
    expect(report.site_overlay_converged).toBe(false);
  });
  it("does not accept modified publisher identity or original event time as overlay parity",()=>{
    const input=fixture();
    const altered=input.site.payload.rows.map(r =>
      r.public_status==="live_observed"
        ? {...r,published_at:"2026-10-09T11:00:00Z"} : r);
    const report=summarizePublicIntelligenceFreshness({
      ...input,site:{status:200,payload:{...input.site.payload,rows:altered}},
    });
    expect(report.site_overlay_converged).toBe(false);
  });
  it("keeps original-time current-scoring checks independent of a matching monitoring batch",()=>{
    const input=fixture();
    const report=summarizePublicIntelligenceFreshness(input);
    expect(report.site_observed_source_batch).toBe(true);
    expect(report.three_domain_current_scored_ready).toBe(false);
    expect(report.scored_domains.macro.latest_original_at).toBe("2026-10-05T19:00:00.000Z");
  });
  it("forces source versioned L2 cache and mandatory post-deploy live parity",()=>{
    const worker=readFileSync("workers/intelligence-edge/src/index.mjs","utf8");
    const workflow=readFileSync(".github/workflows/deploy-intelligence-edge.yml","utf8");
    const probe=readFileSync("scripts/ops/verify-live-intelligence-overlay-convergence.mjs","utf8");
    expect(worker).toContain("/intelligence?projection=d1-hot-v2");
    expect(worker).not.toContain("/intelligence?projection=d1-hot-v1");
    expect(worker).toContain("const hotSnapshot = await readD1HotSnapshot(env);");
    expect(workflow).toContain("scripts/ops/verify-live-intelligence-overlay-convergence.mjs");
    expect(workflow).toContain("Materialize latest B2-readback-verified Intelligence continuity");
    expect(workflow).toContain("wrangler@");
    expect(probe).toContain("D1_CURRENT_OVERLAY_BOUND_TO_B2_VISIBLE");
    expect(probe).toContain("site?.payload?.current_within_24h === true");
    expect(probe).toContain("proof.site_overlay_converged === true");
    expect(probe).toContain("INTELLIGENCE_EDGE_D1_B2_SITE_OVERLAY_NOT_CONVERGED");
    expect(probe).toContain("external_payment_performed: false");
    expect(probe).toContain("direct_b2_reads: 0");
    expect(probe).not.toContain("source_url");
    expect(probe).not.toContain("process.env.");
    expect(probe).not.toContain("POST");
  });
});
