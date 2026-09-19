import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("GDELT V2 live event export selection", () => {
  it("selects only the newest event export available at or before as-of time", () => {
    const script = readFileSync(
      "scripts/ingest-gdelt-v2-events-live.mjs",
      "utf8",
    );

    expect(script).toContain(
      "function parseLastUpdate(text, asOf = NOW)",
    );
    expect(script).toContain(
      'candidates.filter((row) => {',
    );
    expect(script).toContain(
      "batchTime <= asOf.getTime()",
    );
    expect(script).toContain(
      "lastupdate.txt has no Event export available at or before",
    );
    expect(script).toContain(
      "GDELT Event batch is stale",
    );
    expect(script).toContain(
      "async function loadCurrentlyAvailableExport(asOf)",
    );
    expect(script).toContain(
      "GDELT_MAX_AVAILABILITY_WAIT_MINUTES",
    );
    expect(script).toContain(
      "GDELT lastupdate advertises a future Event export",
    );
    expect(script).toContain(
      "setTimeout(resolve, 10_000)",
    );
  });
});
