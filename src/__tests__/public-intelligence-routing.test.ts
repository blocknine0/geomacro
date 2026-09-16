import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

describe("public intelligence routing contract", () => {
  it("provides a real public event-detail route for Intelligence and Ask Geomacro evidence links", () => {
    expect(existsSync(join(ROOT, "src/routes/event.$eventId.tsx"))).toBe(true);

    const intelligence = read("src/routes/intelligence.tsx");
    const askWorkspace = read("src/components/ask/ask-workspace.tsx");
    const eventRoute = read("src/routes/event.$eventId.tsx");
    const eventWorkspace = read("src/components/intelligence/event-detail-workspace.tsx");

    expect(intelligence).toContain('to="/event/$eventId"');
    expect(askWorkspace).toContain('to="/event/$eventId"');
    expect(eventRoute).toContain('createFileRoute("/event/$eventId")');
    expect(eventRoute).toContain("EventDetailWorkspace");
    expect(eventWorkspace).toContain("No wallet is required to read this page");
    expect(eventWorkspace).toContain("Event severity is not a market probability");
  });

  it("keeps research and event reading out of wallet execution context", () => {
    const shell = read("src/components/site-shell.tsx");
    const walletRouteBlock = shell.match(/function isWalletRoute[\s\S]*?\n}\n/)?.[0] ?? "";

    expect(walletRouteBlock).toContain('pathname === "/arena"');
    expect(walletRouteBlock).toContain('pathname === "/onchain"');
    expect(walletRouteBlock).toContain('pathname === "/bridge-swap"');
    expect(walletRouteBlock).toContain('pathname === "/portfolio"');
    expect(walletRouteBlock).not.toContain("/event/");
    expect(walletRouteBlock).not.toContain("/tx-history");
  });

  it("keeps separate risk-index and Ask Geomacro truth boundaries explicit", () => {
    const riskRoute = read("src/routes/global-risk.tsx");
    const riskWorkspace = read("src/components/risk-indices/risk-indices-workspace.tsx");
    const homeRisk = read("src/components/home/gri-section.tsx");
    const askEngine = read("src/lib/ask-intelligence.server.ts");
    const askWorkspace = read("src/components/ask/ask-workspace.tsx");

    expect(riskRoute).toContain("RiskIndicesWorkspace");
    expect(riskWorkspace).toContain("Three risks. Three separate indices.");
    expect(riskWorkspace).toContain("not market probabilities");
    expect(riskWorkspace).toContain("Missing evidence is never displayed as zero risk");
    expect(homeRisk).toContain("compact preview");
    expect(homeRisk).toContain("three-index contract");
    expect(askEngine).toContain("No LLM provider, external search or private fallback score");
    expect(askWorkspace).toContain("does not search the open web at question time");
  });

  it("keeps the historical v1.2 three-domain calculation separate from broader pipeline streams", () => {
    const pipeline = read("src/routes/pipeline.tsx");
    const architecture = read("docs/RISK_INDICES_ARCHITECTURE.md");

    expect(pipeline).toContain("current public GRI v1.2 score uses three domains only");
    expect(pipeline).toContain("geopolitics, macro and rare-earth / critical-mineral risk");
    expect(architecture).toContain("Historical GRI v1.2 remains immutable audit evidence");
    expect(architecture).toContain("three independently presented indices");
  });
});
