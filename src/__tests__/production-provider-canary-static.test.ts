import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const canary = readFileSync("scripts/commerce/run-production-provider-canary.mjs", "utf8");
const common = readFileSync("scripts/commerce/production-canary-common.mjs", "utf8");

describe("production provider real-money canary runner", () => {
  it("is explicit, single-provider, exact-SHA and capped", () => {
    expect(canary).toContain("I_AUTHORIZE_ONE_CAPPED_INTERNAL_REAL_MONEY_CANARY");
    expect(canary).toContain("I_AUTHORIZE_COINBASE_CAPPED_CANARY");
    expect(canary).toContain("I_AUTHORIZE_CIRCLE_CAPPED_CANARY");
    expect(canary).toContain("I_AUTHORIZE_NEVERMINED_CAPPED_CANARY");
    expect(canary).toContain("GEOMACRO_PRODUCTION_CANARY_MAX_USDC");
    expect(canary).toContain("HARD_MAX_USDC_ATOMIC = 50_000n");
    expect(canary).toContain("canaryContext()");
    expect(canary).toContain("verifyCanaryBuild(context)");
  });

  it("uses only the approved initial production cohort and keeps public production forbidden", () => {
    expect(canary).toContain('coinbase: "/api/x402/intelligence"');
    expect(canary).toContain('circle: "/api/x402/circle/intelligence"');
    expect(canary).toContain('nevermined: "/api/x402/nevermined/intelligence"');
    expect(canary).toContain('const BASE_MAINNET = "eip155:8453"');
    expect(canary).toContain('const BASE_USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"');
    expect(canary).not.toContain("geomacro.live/api/x402");
  });

  it("proves unpaid challenge, paid delivery, replay identity and fail-closed changed replay", () => {
    expect(canary).toContain("Production canary expected HTTP 402");
    expect(canary).toContain("Production canary paid request failed");
    expect(canary).toContain("idempotent_replay");
    expect(canary).toContain("Production canary replay returned different intelligence");
    expect(canary).toContain("Changed-request replay did not fail closed");
    expect(canary).toContain("payment_verified: true");
    expect(canary).toContain("replay_no_second_charge: true");
  });

  it("proves all five commercial scopes before the single paid call", () => {
    for (const marker of [
      "geopolitics-deu",
      "macro-bra",
      "critical-minerals-zaf",
      "country-usa",
      "corridor-usa-chn",
    ]) {
      expect(common).toContain(marker);
    }
    expect(canary).toContain("productionAcceptanceAvailabilityCases()");
    expect(canary).toContain("scopeAvailabilityProofs");
    expect(canary).toContain("representative_scope_payment_count: 0");
    expect(canary).toContain("representative_scope_all_chargeable");
    expect(canary).toContain("const evidenceProvider = EVIDENCE_PROVIDERS[provider]");
    expect(canary.match(/const evidenceProvider = EVIDENCE_PROVIDERS\[provider\]/g)?.length).toBe(1);
  });

  it("makes the single paid request itself span all five commercial scopes", () => {
    for (const marker of [
      '{ type: "country", country_iso3: "DEU" }',
      '{ type: "country", country_iso3: "BRA" }',
      '{ type: "country", country_iso3: "ZAF" }',
      '{ type: "country", country_iso3: "USA" }',
      '{ type: "corridor", origin_country_iso3: "USA", destination_country_iso3: "CHN" }',
      '"conflict_geopolitics"',
      '"macro_risk"',
      '"fx_external_risk"',
      '"critical_minerals"',
      '"trade_corridor"',
    ]) {
      expect(common).toContain(marker);
    }
    expect(common).toContain("assertComprehensivePaidScopeDelivery");
    expect(canary).toContain('assertComprehensivePaidScopeDelivery(payment.paid.body');
    expect(canary).toContain('assertComprehensivePaidScopeDelivery(replay.body');
    expect(canary).toContain("representative_scope_single_paid_bundle: true");
  });

  it("keeps raw payment proof and buyer secrets out of persisted evidence", () => {
    expect(canary).toContain("private_key_persisted: false");
    expect(canary).toContain("raw_payment_proof_persisted: false");
    expect(canary).toContain("raw_settlement_reference_persisted_in_public_evidence: false");
    expect(canary).toContain("payment_signature_included: false");
    expect(canary).toContain("private_key_included: false");
    expect(canary).not.toContain("console.log(privateKey");
    expect(canary).not.toContain("console.log(signature");
  });

  it("forces internal canaries outside revenue", () => {
    expect(canary).toContain('internal_canary: true');
    expect(canary).toContain('purchase_classification: "internal_canary"');
    expect(canary).toContain("commercial_revenue: false");
    expect(canary).toContain("public_launch_authorized_by_this_artifact: false");
  });

  it("checks Coinbase on-chain debit and Circle/Nevermined server-side replay before acceptance", () => {
    expect(canary).toContain("Coinbase canary debit mismatch");
    expect(canary).toContain("Coinbase replay changed buyer USDC balance");
    expect(canary).toContain('GatewayClient');
    expect(canary).toContain("circleRequestBody = JSON.parse(serializedBody)");
    expect(canary).toContain("encodePaymentSignatureHeader");
    expect(canary).toContain("Nevermined live plan maximum exceeds the owner-approved canary cap");
    expect(canary).toContain("Production canary replay is not explicitly marked idempotent");
  });
});
