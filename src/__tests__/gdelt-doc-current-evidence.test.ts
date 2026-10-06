import { describe, expect, it } from "vitest";
import { buildGdeltDocCoverageRows } from "../../scripts/ops/gdelt-doc-current-evidence.mjs";

describe("GDELT DOC current evidence fallback", () => {
  it("emits only corroborated fresh unscored media-coverage observations", () => {
    const now = Date.parse("2026-10-07T00:00:00Z");
    const payload = {
      articles: [
        {
          title: "raw headline one must never be projected",
          seendate: "20261006T235500Z",
          domain: "example-a.test",
          sourcecountry: "France",
          url: "https://example-a.test/a",
        },
        {
          title: "raw headline two must never be projected",
          seendate: "20261006T235000Z",
          domain: "example-b.test",
          sourcecountry: "France",
          url: "https://example-b.test/b",
        },
        {
          title: "single-source coverage is insufficient",
          seendate: "20261006T235800Z",
          domain: "only-one.test",
          sourcecountry: "Germany",
          url: "https://only-one.test/c",
        },
        {
          title: "stale article",
          seendate: "20261006T180000Z",
          domain: "stale-a.test",
          sourcecountry: "Italy",
          url: "https://stale-a.test/d",
        },
        {
          title: "stale corroborator",
          seendate: "20261006T180100Z",
          domain: "stale-b.test",
          sourcecountry: "Italy",
          url: "https://stale-b.test/e",
        },
      ],
    };

    const rows = buildGdeltDocCoverageRows(payload, now);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      category: "geopolitics",
      severity: null,
      delta: null,
      public_status: "live_observed",
    });
    expect(rows[0].source_title).toContain("media coverage from France");
    expect(rows[0].summary).toContain("At least 2 independent GDELT-monitored news domains");
    expect(rows[0].summary).toContain("not a verified event claim");
    expect(JSON.stringify(rows[0])).not.toContain("raw headline");
    expect(JSON.stringify(rows[0])).not.toContain("example-a.test");
    expect(JSON.stringify(rows[0])).not.toContain("example-b.test");
  });

  it("fails closed when no country has two independent fresh domains", () => {
    const now = Date.parse("2026-10-07T00:00:00Z");
    expect(() =>
      buildGdeltDocCoverageRows(
        {
          articles: [
            {
              seendate: "20261006T235500Z",
              domain: "single.test",
              sourcecountry: "France",
              url: "https://single.test/a",
            },
          ],
        },
        now,
      ),
    ).toThrow("CURRENT_GDELT_DOC_NO_CORROBORATED_COVERAGE");
  });
});
