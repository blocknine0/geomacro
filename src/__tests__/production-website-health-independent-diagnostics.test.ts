import { readFileSync } from "node:fs";
const read = (p: string) => readFileSync(p, "utf8");
import { describe, expect, it } from "vitest";

const workflow = read(".github/workflows/production-website-health.yml");

const independentGates = [
  "Verify live build marker matches canonical main",
  "Verify Lovable mirror source parity",
  "Verify B2 production serving health",
  "Verify live D1 control plane and fail-closed auth",
  "Verify production alignment contract",
  "Verify independent Global Risk and Risk Indices edges",
  "Verify public production APIs and current Intelligence contract",
  "Verify free homepage, Ask and D1-derived Finds without credentials",
] as const;

describe("independent production website failure diagnostics", () => {
  it("runs independent gates after an earlier SHA or current-hot-product failure", () => {
    for (const name of independentGates) {
      const offset = workflow.indexOf("      - name: " + name + "\n");
      expect(offset, name).toBeGreaterThanOrEqual(0);
      const nextStep = workflow.indexOf("\n      - name: ", offset + 1);
      const step = workflow.slice(offset, nextStep < 0 ? undefined : nextStep);
      expect(step, name).toContain("if: ${{ !cancelled() }}");
      expect(step, name).not.toContain("continue-on-error:");
    }
  });

  it("keeps manual Lovable publication failures actionable without wasting a 20-minute job", () => {
    expect(workflow).toContain("seq 1 8");
    expect(workflow).not.toContain("seq 1 40");
    expect(workflow).toContain("LIVE_DEPLOYMENT_SHA_MISMATCH");
    expect(workflow).toContain("Lovable Publish required or incomplete");
    expect(workflow).toContain("Verify Lovable mirror source parity");
  });

  it("does not weaken B2/D1 freshness, signed edge, or x402 fail-closed acceptance", () => {
    expect(workflow).not.toContain("status: deepReady ? 200 : 503");
    expect(workflow).toContain("Verify B2 production serving health");
    expect(workflow).toContain("intelligence_ready");
    expect(workflow).toContain("global_risk_ready");
    expect(workflow).toContain("risk_indices_ready");
    expect(workflow).toContain("Verify live D1 control plane and fail-closed auth");
    expect(workflow).toContain("Verify independent Global Risk and Risk Indices edges");
    expect(workflow).not.toContain("continue-on-error: true");
  });

  it("checks published free homepage and About semantics, not obsolete marketing copy", () => {
    const homepage = read("src/components/home/commercial-home.tsx");
    const finds = read("src/components/home/live-intelligence-showcase.tsx");
    const about = read("src/routes/about.tsx");
    const ask = read("src/routes/ask-geomacro.tsx");
    for (const phrase of ["Understand global risk.", "Know what matters."]) {
      expect(homepage).toContain(phrase);
      expect(workflow).toContain("home.includes");
      expect(workflow).toContain("'" + phrase + "'");
    }
    expect(finds).toContain("Geomacro Finds");
    expect(workflow).toContain("['home-finds',home,'Geomacro Finds']");
    expect(ask).toContain("Ask Geomacro");
    expect(workflow).toContain("['ask-heading',ask,'Ask Geomacro']");
    const currentAbout = "Understand the world. Inspect the context.";
    expect(about).toContain(currentAbout);
    expect(workflow).toContain("/about|" + currentAbout);
    expect(workflow).not.toContain("/about|About & trust");
    expect(workflow).not.toContain("'Know what changed'");
  });

  it("keeps free canary strict on actual public responses and paid-health independence", () => {
    expect(workflow).toContain("if: github.repository == 'blocknine0/geomacro' && github.ref == 'refs/heads/main'");
    expect(workflow).toContain("read('/api/v1/finds','json')");
    expect(workflow).toContain("read(d1+'/v1/public/website-derived-news','json')");
    expect(workflow).toContain("if(r.status!==200)throw Error('PUBLIC_FREE_ROUTE_HTTP_'");
    expect(workflow).toContain("PUBLIC_FREE_D1_JOURNAL_INVALID");
    expect(workflow).toContain("PUBLIC_FREE_FINDS_CONTRACT_INVALID");
    expect(workflow).toContain("PUBLIC_FINDS_PRIVATE_OR_SCORED_DATA");
    expect(workflow).toContain("Verify B2 production serving health");
    expect(workflow).toContain("risk_indices_ready");
    expect(workflow).not.toContain("continue-on-error: true");
  });
});
