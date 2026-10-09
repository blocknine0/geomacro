import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import { summarizePublicIntelligenceFreshness } from "../../scripts/lib/public-intelligence-freshness-audit.mjs";

const now = Date.parse("2026-10-09T10:00:00.000Z");
const hash = "a".repeat(64);
const row = (id: string, category: string, at: string) => ({
  id, category, source_title: "Geomacro finds a specific export control rule affecting supply",
  summary:"Effect on trade flows.", severity: 72, delta:null,
  created_at:at, published_at:at, public_status:"verified_b2",
});
const rows = [
  row("geo", "geopolitics", "2026-10-09T09:15:00Z"),
  row("macro", "macro", "2026-10-07T08:15:00Z"),
  row("rare", "rare_earth", "2026-10-06T08:15:00Z"),
];
function args(input = rows, overrides: Record<string, unknown> = {}) {
  return {
    now,
    edge:{
      status:200, authority:"backblaze-b2-intelligence-edge",
      b2_sha256:hash,
      current_overlay:"cloudflare-d1-hot",
      payload:{
        schema:"geomacro.public-intelligence-live.v1",
        source_project:"ldpwajisioljyjtojvfx",
        rows:input,
      },
    },
    site:{status:200,payload:{ok:true,mode:"verified_b2",rows:input}},
    overlay:{
      status:200,verified_b2_sha256:hash,
      current_source_batch_at:"2026-10-09T09:45:00Z",
    },
    ...overrides,
  };
}
describe("#1827 low-cost website 3-category current evidence truth", () => {
  it("distinguishes one fresh domain from genuinely older Macro/FX and Critical Minerals", () => {
    const p = summarizePublicIntelligenceFreshness(args());
    expect(p.current_verified_scored_domains).toBe(1);
    expect(p.three_domain_current_scored_ready).toBe(false);
    expect(p.scored_domains.geopolitics.state).toBe("CURRENT_VERIFIED");
    expect(p.scored_domains.macro.state).toBe("HISTORICAL_VERIFIED");
    expect(p.scored_domains.rare_earth.state).toBe("HISTORICAL_VERIFIED");
    expect(p.scored_domains.rare_earth.latest_original_at).toBe("2026-10-06T08:15:00.000Z");
    expect(p.current_overlay_state).toBe("D1_CURRENT_OVERLAY_BOUND_TO_B2_VISIBLE");
    expect(p.payment_performed).toBe(false);
    expect(p.supabase_reads).toBe(0);
    expect(p.b2_direct_reads).toBe(0);
    expect(p.commercial_payable_ready).toBe(false);
    expect(JSON.stringify(p)).not.toContain("specific export control");
  });
  it("fails closed when overlay and B2 baseline hash diverge despite public HTTP 200", () => {
    const p = summarizePublicIntelligenceFreshness(args(rows,{
      overlay:{ status:200, verified_b2_sha256:"b".repeat(64),
        current_source_batch_at:"2026-10-09T09:45:00Z" },
    }));
    expect(p.current_overlay_state).toBe("EDGE_BASELINE_AND_D1_OVERLAY_HASH_MISMATCH");
  });
  it("detects missing D1 current metadata versus an edge that has stopped projecting it", () => {
    const off = summarizePublicIntelligenceFreshness(args(rows,{overlay:{status:503}}));
    const unbound = summarizePublicIntelligenceFreshness(args(rows,{
      edge:{...args().edge,current_overlay:"none"},
    }));
    expect(off.current_overlay_state).toBe("D1_CURRENT_OVERLAY_UNAVAILABLE_OR_STALE");
    expect(unbound.current_overlay_state).toBe("EDGE_NOT_PROJECTING_VERIFIED_D1_CURRENT_OVERLAY");
  });
  it("reports a fully current authorized public feed but does not declare commercial payment readiness", () => {
    const freshRows = ["geopolitics","macro","rare_earth"].map((c,i) =>
      row(String(i),c,"2026-10-09T09:50:00Z"));
    const p = summarizePublicIntelligenceFreshness(args(freshRows));
    expect(p.three_domain_current_scored_ready).toBe(true);
    expect(p.commercial_payable_ready).toBe(false);
  });
  it("never conflates unscored live observation or future dated private scoring with public current scores", () => {
    const input = [
      ...rows.filter(x=>x.category==="macro"),
      {...rows[0],category:"geopolitics",public_status:"live_observed",severity:null,source_title:"Geomacro observes an event"},
      row("future","rare_earth","2026-10-11T10:00:00Z"),
    ];
    const p = summarizePublicIntelligenceFreshness(args(input));
    expect(p.current_verified_scored_domains).toBe(0);
    expect(p.scored_domains.geopolitics.state).toBe("NO_PUBLIC_SCORED_EVIDENCE");
    expect(p.scored_domains.rare_earth.verified_scored_count).toBe(0);
    expect(p.three_domain_current_scored_ready).toBe(false);
  });
  it("keeps permanently scheduled probe source-only, fixed-host and no quota-heavy writers", () => {
    const workflow = readFileSync(".github/workflows/public-three-domain-freshness-audit.yml","utf8");
    const script = readFileSync("scripts/ops/audit-live-public-intelligence-three-domains.mjs","utf8");
    expect(workflow).toContain('cron: "17 */6 * * *"');
    expect(workflow).not.toContain("secrets.");
    expect(workflow).not.toContain("SUPABASE_");
    expect(script).toContain("/v1/public/intelligence-overlay");
    expect(script).toContain("process.exitCode = 3");
    expect(script).not.toContain("B2_APPLICATION_KEY");
    expect(script).not.toContain("api/x402/");
    expect(script).not.toContain("source_url");
  });
});
