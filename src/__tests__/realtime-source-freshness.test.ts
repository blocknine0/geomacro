import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/066_source_network_realtime_freshness.sql",
  "utf8",
);

describe("realtime source freshness gate", () => {
  it("fails closed on future or unverified GDELT manifests", () => {
    expect(migration).toContain("period_end <= now()");
    expect(migration).toContain("sealed_at is not null");
    expect(migration).toContain("verified_at is not null");
    expect(migration).toContain("extract(epoch from (now() - period_end)) between 0 and 1800");
  });
});
