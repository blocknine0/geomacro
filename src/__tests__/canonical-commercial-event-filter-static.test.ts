import fs from "node:fs";
import { describe, expect, it } from "vitest";

const publisher = fs.readFileSync("src/lib/country-risk-publisher.server.ts", "utf8");

describe("canonical country risk commercial event filter", () => {
  it("filters both CANONICAL and PUBLIC_DEMO to commercially admissible structured events", () => {
    expect(publisher).toContain('deliveryProfile === "PUBLIC_DEMO" ||\n    deliveryProfile === "CANONICAL"');
    expect(publisher).toContain('item.status ===\n                  "VERIFIED" ||\n                item.status ===\n                  "DERIVED_ONLY"');
  });

  it("filters event payloads and eligibility metadata through the same event-id set", () => {
    expect(publisher).toContain('loaded.events.filter');
    expect(publisher).toContain('eligibleEventIds.has(\n              event.id');
    expect(publisher).toContain('loaded\n          .commercial_eligibility\n          .filter');
    expect(publisher).toContain('eligibleEventIds.has(\n                item.event_id');
  });

  it("keeps FEDERICO_STRICT outside the generic canonical/public filtering branch", () => {
    expect(publisher).toContain('deliveryProfile === "FEDERICO_STRICT"');
    expect(publisher).toContain(': await loadRecentStructuredEvents');
  });
});
