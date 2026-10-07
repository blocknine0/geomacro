import { describe, expect, it } from "vitest";
import { parseGdeltMasterfileTail } from "../../scripts/ops/gdelt-masterfile-current-evidence.mjs";

describe("GDELT masterfile current Event fallback", () => {
  it("selects only recent exact-host MD5-bound Event exports from a ranged tail", () => {
    const now = Date.parse("2026-10-07T17:00:00Z");
    const text = [
      "partial-line-from-range-start",
      "150000 11111111111111111111111111111111 http://data.gdeltproject.org/gdeltv2/20261007164500.export.CSV.zip",
      "151000 22222222222222222222222222222222 https://data.gdeltproject.org/gdeltv2/20261007163000.export.CSV.zip",
      "152000 33333333333333333333333333333333 https://evil.example/gdeltv2/20261007165500.export.CSV.zip",
      "153000 44444444444444444444444444444444 https://data.gdeltproject.org/gdeltv2/20261007170000.mentions.CSV.zip",
      "154000 not-an-md5 https://data.gdeltproject.org/gdeltv2/20261007161500.export.CSV.zip",
      "155000 55555555555555555555555555555555 https://data.gdeltproject.org/gdeltv2/20261007190000.export.CSV.zip",
      "156000 66666666666666666666666666666666 https://data.gdeltproject.org/gdeltv2/20261007140000.export.CSV.zip",
      "",
    ].join("\n");

    const rows = parseGdeltMasterfileTail(text, {
      now,
      rangeStartsMidFile: true,
    });

    expect(rows).toEqual([
      {
        size: 150000,
        md5: "11111111111111111111111111111111",
        batchIso: "2026-10-07T16:45:00.000Z",
        listedUrl: "http://data.gdeltproject.org/gdeltv2/20261007164500.export.CSV.zip",
        secureUrl: "https://data.gdeltproject.org/gdeltv2/20261007164500.export.CSV.zip",
      },
      {
        size: 151000,
        md5: "22222222222222222222222222222222",
        batchIso: "2026-10-07T16:30:00.000Z",
        listedUrl: "https://data.gdeltproject.org/gdeltv2/20261007163000.export.CSV.zip",
        secureUrl: "https://data.gdeltproject.org/gdeltv2/20261007163000.export.CSV.zip",
      },
    ]);
  });

  it("drops an incomplete first ranged line and returns at most eight newest candidates", () => {
    const now = Date.parse("2026-10-07T17:00:00Z");
    const lines = ["999 00000000000000000000000000000000 http://data.gdeltproject.org/gdeltv2/20261007170000.export.CSV.zip"];
    for (let minute = 0; minute < 10; minute += 1) {
      const hhmm = String(1645 - minute).padStart(4, "0");
      lines.push(
        `1000 aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa https://data.gdeltproject.org/gdeltv2/20261007${hhmm}00.export.CSV.zip`,
      );
    }

    const rows = parseGdeltMasterfileTail(lines.join("\n"), {
      now,
      rangeStartsMidFile: true,
    });

    expect(rows).toHaveLength(8);
    expect(rows[0]?.batchIso).toBe("2026-10-07T16:45:00.000Z");
    expect(rows.at(-1)?.batchIso).toBe("2026-10-07T16:38:00.000Z");
  });
});
