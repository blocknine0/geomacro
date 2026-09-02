import { describe, expect, it, vi } from "vitest";

vi.mock("./supabase-app.server", () => ({
  getAppSupabase: () => ({
    from: (table: string) => {
      if (table === "events") {
        return {
          select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: "evt-1", source_title: "Stored event", category: null, summary: null, narrative: null, stage: null, severity: null, confidence: null, delta: null, published_at: null, created_at: null, resolution_at: null }, error: null }) }) }),
        };
      }
      return {
        select: () => ({ eq: () => ({ eq: () => ({ order: () => ({ limit: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }) }) }),
      };
    },
  }),
}));

import { getEventIntelligence } from "./agent-intelligence.server";

describe("canonical agent intelligence", () => {
  it("preserves optional missing values as null", async () => {
    const result = await getEventIntelligence("evt-1");
    expect(result?.event.title).toBe("Stored event");
    expect(result?.event.category).toBeNull();
    expect(result?.risk.severity).toBeNull();
    expect(result?.gri.displayScore).toBeNull();
  });
});
