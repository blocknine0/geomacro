import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

describe("public intelligence routing contract", () => {
  it("reads canonical structured and verified live intelligence before legacy events", () => {
    const publicRead = read("src/lib/public-intelligence.functions.ts");

    expect(publicRead).toContain('from("live_structured_events")');
    expect(publicRead).toContain('from("live_flash_event_families")');
    expect(publicRead).toContain('from("live_flash_events")');
    expect(publicRead).toContain('eq("verification_status", "VERIFIED")');
    expect(publicRead).toContain('from("events")');
    expect(publicRead).toContain("missingCurrentCategories(rows, now)");
    expect(publicRead).toContain("at >= now - DAY_MS && at <= now");
    expect(publicRead).toContain("if (rows.length > 0 && missing.length === 0) return sortAndDedupe(rows);");
    expect(publicRead).toContain("Older structured rows are");
    expect(publicRead).toContain("retained for explicit research but never suppress a fresher fallback path.");
    expect(publicRead).toContain("PUBLIC_INTELLIGENCE_QUERY_TIMEOUT_MS");
  });

  it("provides a real public event-detail route for Intelligence and Ask Geomacro evidence links", () => {
    expect(existsSync(join(ROOT, "src/routes/event.$eventId.tsx"))).toBe(true);

    const intelligence = read("src/routes/intelligence.tsx");
    const askWorkspace = read("src/components/ask/ask-workspace.tsx");
    const eventRoute = read("src/routes/event.$eventId.tsx");
    const eventWorkspace = read("src/components/intelligence/event-detail-workspace.tsx");

    expect(intelligence).toContain('to="/event/$eventId"');
    expect(intelligence).toContain("LATEST VERIFIED");
    expect(intelligence).toContain("Live refresh pending · showing latest verified records");
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

  it("keeps three separate Global Risk indices on the customer route while retaining legacy proof workspace code", () => {
    const globalRiskRoute = read("src/routes/global-risk.tsx");
    const globalRiskWorkspace = read("src/components/gri/global-risk-workspace.tsx");
    const riskIndicesRoute = read("src/routes/risk-indices.tsx");
    const riskIndicesWorkspace = read("src/components/risk-indices/risk-indices-workspace.tsx");
    const home = read("src/components/home/commercial-home.tsx");
    const askEngine = read("src/lib/ask-intelligence.server.ts");
    const askWorkspace = read("src/components/ask/ask-workspace.tsx");

    expect(globalRiskRoute).toContain("RiskIndicesWorkspace");
    expect(globalRiskRoute).not.toContain("GlobalRiskWorkspace");
    expect(globalRiskWorkspace).toContain("How global risk is moving");
    expect(globalRiskWorkspace).toContain('const TIMEFRAMES: Timeframe[] = ["24H", "7D", "30D"]');
    expect(riskIndicesRoute).toContain("RiskIndicesWorkspace");
    expect(riskIndicesWorkspace).toContain("Three risks. Three separate indices.");
    expect(riskIndicesWorkspace).toContain("does not substitute zero or a synthetic estimate");
    expect(home).toContain('to="/global-risk"');
    expect(askEngine).toContain("Current public-web grounding takes precedence for user questions");
    expect(askWorkspace).toContain("Raw source content, provider details and internal retrieval payloads are not exposed in the answer.");
  });

  it("keeps the historical v1.2 three-domain calculation separate from broader pipeline streams", () => {
    const pipeline = read("src/routes/pipeline.tsx");
    const architecture = read("docs/RISK_INDICES_ARCHITECTURE.md");

    expect(pipeline).toContain("versioned GRI v1.2 three-domain methodology");
    expect(pipeline).toContain("geopolitics, macro and rare-earth / critical-mineral risk");
    expect(architecture).toContain("Historical GRI v1.2 remains immutable audit evidence");
    expect(architecture).toContain("three independently presented indices");
  });
});
