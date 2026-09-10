import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const route = readFileSync(
  join(process.cwd(), "src/routes/api.commercial.structural.ts"),
  "utf8",
);
const access = readFileSync(
  join(process.cwd(), "src/lib/commercial-access.server.ts"),
  "utf8",
);

describe("commercial structural API", () => {
  it("uses server-resolved entitlements and idempotent commercial usage", () => {
    expect(route).toContain("authenticateCommercialApiRequest");
    expect(route).toContain("resolveCommercialEntitlementTier");
    expect(route).toContain("ensureCommercialCreditAccount");
    expect(route).toContain("consumeCommercialCapability");
    expect(access).toContain('from("commercial_entitlement_grants")');
    expect(access).toContain('eq("contract_version", GEOMACRO_CREDIT_CONTRACT_VERSION)');
  });

  it("serves governed structural context without raw warehouse fields", () => {
    expect(route).toContain("loadStructuralContext");
    expect(route).toContain("response_sha256");
    expect(route).toContain("structured_delivery_only: true");
    expect(route).toContain("raw_data_included: false");
    expect(route).toContain("private_warehouse_access: false");
    expect(route).not.toContain("provenance: row.provenance");
    expect(route).not.toContain("source_url: row.source_url");
  });

  it("fails closed for missing data and never authorizes execution", () => {
    expect(route).toContain("STRUCTURAL_DATA_NOT_CONFIGURED");
    expect(route).toContain("STRUCTURAL_DATA_UNAVAILABLE");
    expect(route).toContain("execution_authorized: false");
    expect(route).toContain("structural_data_is_gri_v1_2_input: false");
  });
});
