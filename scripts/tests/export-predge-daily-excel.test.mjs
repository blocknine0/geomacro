import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("export-predge-daily-excel.py accumulates daily rows with time, date, and tier into .xlsx", () => {
  const dir = mkdtempSync(join(tmpdir(), "predge-excel-"));
  try {
    writeFileSync(
      join(dir, "2026-11-23-summary.csv"),
      [
        '"record_type","day_utc","country_iso3","category","tier","created","sent_to_predge","delivered","failed","expected_geomacro_net_usd"',
        '"TOTAL","2026-11-23","","","","12","5","5","0","0.50"',
        '"TIER","2026-11-23","","","BASIC","10","4","4","0","0.40"',
        '"CELL","2026-11-23","USA","GEOPOLITICS","BASIC","10","4","4","0","0.40"',
      ].join("\n"),
    );
    const xlsx = join(dir, "predge-daily-internal-log.xlsx");
    const first = JSON.parse(execFileSync("python3", ["scripts/ops/export-predge-daily-excel.py", dir, xlsx, "2026-11-23T23:55:00Z"], { encoding: "utf8" }));
    assert.equal(first.summary_rows, 2);
    assert.equal(first.cell_rows, 1);

    writeFileSync(
      join(dir, "2026-11-24-summary.csv"),
      [
        '"record_type","day_utc","country_iso3","category","tier","created","sent_to_predge","delivered","failed","expected_geomacro_net_usd"',
        '"TOTAL","2026-11-24","","","","20","8","8","0","0.90"',
        '"TIER","2026-11-24","","","STANDARD","20","8","8","0","0.90"',
      ].join("\n"),
    );
    const second = JSON.parse(execFileSync("python3", ["scripts/ops/export-predge-daily-excel.py", dir, xlsx, "2026-11-24T23:55:00Z"], { encoding: "utf8" }));
    assert.equal(second.summary_rows, 4);
    assert.equal(second.cell_rows, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
