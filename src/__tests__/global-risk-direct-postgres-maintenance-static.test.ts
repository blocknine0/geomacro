import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const script = readFileSync("scripts/ops/publish-b2-global-risk-direct-postgres.mjs", "utf8");

describe("canonical Global Risk direct-Postgres maintenance contract", () => {
  it("terminates every dynamic read statement before the transaction commit", () => {
    expect(script).toContain('function terminateSqlStatement(sql)');
    expect(script).toContain('.replace(/;+\\s*$/u, "")');
    expect(script).toContain('return `${statement};`;');
    expect(script).toContain('${terminateSqlStatement(sql)}\n    commit;');
  });

  it("keeps the database transaction read-only and fail-closed", () => {
    expect(script).toContain("begin read only;");
    expect(script).toContain("ON_ERROR_STOP=1");
    expect(script).toContain('throw new Error("GLOBAL_RISK_SQL_EMPTY")');
    expect(script).toContain('status = \'published\'');
    expect(script).toContain('verification_status = \'verified\'');
  });
});
