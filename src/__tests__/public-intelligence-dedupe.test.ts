import { describe, expect, it } from "vitest";
import { dedupePublicIntelligenceRows } from "@/lib/public-intelligence-dedupe";

const at = (hours: number) => new Date(Date.UTC(2026, 9, 4, 12 + hours)).toISOString();

describe("public Intelligence story dedupe", () => {
  it("keeps only the newest representative of the same underlying story", () => {
    const rows = dedupePublicIntelligenceRows([
      {
        id: "newer",
        category: "rare_earth",
        source_title: "Geomacro finds Atlantico Energy Metals confirms gallium and rare earth elements in all 114 follow-up samples from Novo Cruzeiro",
        summary: "Atlantico confirms gallium and rare earths in all 114 follow-up samples at Novo Cruzeiro.",
        public_status: "verified_b2",
        published_at: at(0),
        created_at: at(0),
      },
      {
        id: "older",
        category: "rare_earth",
        source_title: "Geomacro finds Atlantico Energy Metals reports all 114 follow-up samples from Novo Cruzeiro contain gallium and rare earth elements",
        summary: "Atlantico confirms gallium and rare earths in all 114 follow-up samples at Novo Cruzeiro.",
        public_status: "verified_b2",
        published_at: at(-1),
        created_at: at(-1),
      },
    ]);

    expect(rows).toHaveLength(1);
    expect((rows[0] as { id: string }).id).toBe("newer");
  });

  it("suppresses close paraphrases inside the bounded duplicate window", () => {
    const rows = dedupePublicIntelligenceRows([
      {
        id: "newer",
        category: "geopolitics",
        source_title: "Geomacro finds Iran announces a Gulf exclusion zone and threatens U.S. naval forces",
        summary: "Iran threatens U.S. warships, Gulf exclusion zone.",
        public_status: "verified_b2",
        published_at: at(0),
        created_at: at(0),
      },
      {
        id: "older",
        category: "geopolitics",
        source_title: "Geomacro finds Iran plans a new Gulf exclusion zone while warning U.S. warships",
        summary: "Iran plans Gulf exclusion zone, threatens U.S. warships.",
        public_status: "verified_b2",
        published_at: at(-2),
        created_at: at(-2),
      },
    ]);

    expect(rows).toHaveLength(1);
    expect((rows[0] as { id: string }).id).toBe("newer");
  });

  it("does not collapse distinct events just because they share generic risk words", () => {
    const rows = dedupePublicIntelligenceRows([
      {
        id: "india",
        category: "geopolitics",
        source_title: "Geomacro observes coercive activity in India",
        summary: "Verified current conflict-event metadata indicates coercive activity in India.",
        public_status: "live_observed",
        published_at: at(0),
        created_at: at(0),
      },
      {
        id: "serbia",
        category: "geopolitics",
        source_title: "Geomacro observes coercive activity in Serbia",
        summary: "Verified current conflict-event metadata indicates coercive activity in Serbia.",
        public_status: "live_observed",
        published_at: at(-1),
        created_at: at(-1),
      },
    ]);

    expect(rows).toHaveLength(2);
  });

  it("does not dedupe across categories or outside 72 hours", () => {
    const same = {
      source_title: "Geomacro finds Central bank policy shock raises market risk",
      summary: "Central bank policy shock raises market risk materially.",
      public_status: "verified_b2",
    };
    const rows = dedupePublicIntelligenceRows([
      { ...same, id: "macro-now", category: "macro", published_at: at(0), created_at: at(0) },
      { ...same, id: "geo-now", category: "geopolitics", published_at: at(0), created_at: at(0) },
      { ...same, id: "macro-old", category: "macro", published_at: "2026-09-29T12:00:00.000Z", created_at: "2026-09-29T12:00:00.000Z" },
    ]);

    expect(rows).toHaveLength(3);
  });
});
