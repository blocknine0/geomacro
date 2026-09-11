import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const browserService = readFileSync("src/lib/testnet-browser-intelligence.server.ts", "utf8");
const severityService = readFileSync("src/lib/testnet-live-severity.server.ts", "utf8");
const apiRoute = readFileSync("server/api/testnet-tester/intelligence.post.ts", "utf8");
const consoleRoute = readFileSync("server/routes/testnet-console.get.ts", "utf8");
const consoleScript = readFileSync("public/testnet-console.js", "utf8");

describe("testnet structural severity console", () => {
  it("serves governed structural country and corridor capabilities", () => {
    expect(apiRoute).toContain("structural_country_digest");
    expect(apiRoute).toContain("structural_corridor_digest");
    expect(browserService).toContain("loadStructuralContext");
    expect(browserService).toContain("structuredDeliveryPolicy");
  });

  it("reads actual severity from the canonical live structured event table", () => {
    expect(severityService).toContain('.from("live_structured_events")');
    expect(severityService).toContain('"id,event_type,primary_country,countries,severity,confidence,direction,first_seen_at,last_seen_at,structure_version"');
    expect(severityService).toContain('scale: "0-100"');
    expect(browserService).toContain("loadTestnetLiveSeverity");
    expect(browserService).toContain("latest_severity");
  });

  it("keeps structural warehouse and live severity provenance distinct", () => {
    expect(browserService).toContain("observations:");
    expect(browserService).toContain("severity,");
    expect(severityService).toContain('source_table: "live_structured_events"');
  });

  it("exposes a dedicated active-tester browser console", () => {
    expect(consoleRoute).toContain('/testnet-console.js');
    expect(consoleRoute).toContain("STRUCTURAL DATA + LIVE SEVERITY");
    expect(consoleScript).toContain('/api/testnet-tester/intelligence');
    expect(consoleScript).toContain("Credits remaining");
    expect(consoleScript).toContain("Create share card");
  });
});
