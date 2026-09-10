import {
  readFileSync,
} from "node:fs";
import {
  join,
} from "node:path";
import {
  describe,
  expect,
  it,
} from "vitest";

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/049_commercial_access_principals.sql"),
  "utf8",
);

describe("commercial access principal migration", () => {
  it("stores only hashed API credentials and keeps tables server-only", () => {
    expect(migration).toContain("api_key_hash");
    expect(migration).toContain("^[0-9a-f]{64}$");
    expect(migration).toContain("revoke all on table public.commercial_api_credentials from PUBLIC, anon, authenticated");
    expect(migration).toContain("grant all on table public.commercial_api_credentials to service_role");
  });

  it("records entitlement provenance independently from payment providers", () => {
    expect(migration).toContain("commercial_entitlement_grants");
    expect(migration).toContain("payment_provider");
    expect(migration).toContain("goat_x402");
    expect(migration).toContain("free_provisioning");
  });
});
