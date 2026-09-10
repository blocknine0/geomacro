import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/901_commercial_credit_idempotency_hardening.sql"),
  "utf8",
);

describe("commercial credit idempotency hardening", () => {
  it("allows only exact request-id replays", () => {
    expect(migration).toContain("IDEMPOTENCY_CONFLICT");
    expect(migration).toContain("v_existing.capability <> p_capability");
    expect(migration).toContain("v_existing.credit_cost <> p_credit_cost");
    expect(migration).toContain("v_existing.contract_version <> p_contract_version");
    expect(migration).toContain("'idempotent_replay', true");
  });

  it("keeps the credit debit atomic under the account row lock", () => {
    expect(migration).toContain("for update");
    expect(migration).toContain("credits_used = credits_used + p_credit_cost");
    expect(migration).toContain("insert into public.commercial_credit_usage");
  });
});
