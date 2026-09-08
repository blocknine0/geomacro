import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

describe("public intelligence routing contract", () => {
  it("provides a real public event-detail route for Intelligence and Ask Geomacro evidence links", () => {
    expect(existsSync(join(ROOT, "src/routes/event.$eventId.tsx"))).toBe(true);

    const intelligence = read("src/routes/intelligence.tsx");
    const ask = read("src/components/home/ask-geomacro.tsx");
    const eventRoute = read("src/routes/event.$eventId.tsx");

    expect(intelligence).toContain('to="/event/$eventId"');
    expect(ask).toContain('to="/event/$eventId"');
    expect(eventRoute).toContain('createFileRoute("/event/$eventId")');
    expect(eventRoute).toContain("No wallet is required to read this page");
    expect(eventRoute).toContain("Event severity is not a market probability");
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

  it("keeps GRI and Ask Geomacro truth boundaries explicit", () => {
    const gri = read("src/routes/global-risk.tsx");
    const askEngine = read("src/lib/ask-intelligence.server.ts");
    const askUi = read("src/components/home/ask-geomacro.tsx");

    expect(gri).toContain("not a guarantee of future market outcomes");
    expect(gri).toContain("private-pilot commercial");
    expect(askEngine).toContain("No LLM provider is involved");
    expect(askEngine).toContain("It never computes a private fallback score");
    expect(askUi).toContain("does not perform external web search");
  });

  it("separates broader pipeline streams from the current three-domain GRI", () => {
    const pipeline = read("src/routes/pipeline.tsx");
    expect(pipeline).toContain("current public GRI v1.2 score uses three domains only");
    expect(pipeline).toContain("geopolitics, macro and rare-earth / critical-mineral risk");
  });
});
