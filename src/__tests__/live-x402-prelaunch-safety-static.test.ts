import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("live x402 prelaunch safety probe", () => {
  it("allows no-charge testnet readiness without authorizing production funds", () => {
    const source = readFileSync("scripts/agentic/verify-live-x402-prelaunch-availability.mjs", "utf8");

    expect(source).toContain('const BASE_SEPOLIA_NETWORK = "eip155:84532"');
    expect(source).toContain("response.status === 422");
    expect(source).toContain("result.deliverable === false");
    expect(source).toContain("response.status === 200");
    expect(source).toContain("result.deliverable === true");
    expect(source).toContain("result.network === BASE_SEPOLIA_NETWORK");
    expect(source).toContain("body.payment_required_now === false");
    expect(source).toContain("body.execution_authorized === false");
    expect(source).toContain("all_representative_cases_safe_prelaunch");
    expect(source).toContain("all_available_cases_testnet_only");
    expect(source).toContain("payable_production_resources_advertised: 0");
  });

  it("covers representative regions without widening payment or execution", () => {
    const source = readFileSync("scripts/agentic/verify-live-x402-prelaunch-availability.mjs", "utf8");

    for (const region of [
      "north_america",
      "latin_america",
      "europe",
      "africa",
      "middle_east",
      "south_asia",
      "east_asia",
    ]) {
      expect(source).toContain(`\"${region}\"`);
    }
    for (const iso3 of ["USA", "BRA", "DEU", "ZAF", "ARE", "IND", "CHN"]) {
      expect(source).toContain(`country_iso3: \"${iso3}\"`);
    }
    expect(source).toContain('schema_version: "geomacro.live-x402-prelaunch-availability.v5"');
    expect(source).toContain("representative_regions: [...REQUIRED_REGIONS].sort()");
    expect(source).toContain("representative_case_count: cases.length");
    expect(source).toContain("payment_performed: false");
    expect(source).toContain("real_funds_touched: false");
    expect(source).toContain("GEOMACRO_X402_REQUIRE_REPRESENTATIVE_AVAILABLE");
    expect(source).toContain("all_representative_cases_available");
    expect(source).toContain("representative_availability_enforced");
    expect(source).toContain("#1414 representative commercial x402 scopes are not all currently AVAILABLE");
  });
  it("requires a no-funds 195+ global country paid-path census from the canonical 250 entity universe", () => {
    const census = readFileSync(
      "scripts/agentic/verify-live-x402-country-availability-census.mjs",
      "utf8",
    );
    const workflow = readFileSync(
      ".github/workflows/live-x402-prelaunch-availability.yml",
      "utf8",
    );

    expect(census).toContain('parseSet("SOVEREIGN_ISO3")');
    expect(census).toContain('parseSet("TERRITORY_ISO3")');
    expect(census).toContain('parseSet("SPECIAL_ENTITY_ISO3")');
    expect(census).toContain("groups.SOVEREIGN.length !== 194");
    expect(census).toContain("groups.TERRITORY.length !== 53");
    expect(census).toContain("groups.SPECIAL_ENTITY.length !== 3");
    expect(census).toContain("entities.length !== 250");
    expect(census).toContain("Math.max(195");
    expect(census).toContain("payment_performed: false");
    expect(census).toContain("real_funds_touched: false");
    expect(census).toContain("body?.payment_required_now === false");
    expect(census).toContain("body?.execution_authorized === false");
    expect(census).toContain("BASE_SEPOLIA_NETWORK");
    expect(census).toContain("X402_COUNTRY_DELIVERABILITY_BELOW_1414_TARGET");
    expect(census).toContain("X402_COUNTRY_CENSUS_INCOMPLETE_PATHS");
    expect(census).toContain('outcome: "INCOMPLETE"');
    expect(census).toContain('code: "RATE_LIMITED"');
    expect(census).toContain("const ENFORCE =");
    expect(workflow).toContain("GEOMACRO_X402_COUNTRY_CENSUS_ENFORCE");
    expect(workflow).toContain("GEOMACRO_X402_REQUIRE_REPRESENTATIVE_AVAILABLE:");
    expect(workflow).toContain("github.event_name == 'pull_request'");
    expect(workflow).toContain("verify-live-x402-country-availability-census.mjs");
    expect(workflow).toContain("live-x402-country-availability-census.json");
  });

  it("serializes enforced main acceptance after exact production deployment health", () => {
    const workflow = readFileSync(
      ".github/workflows/live-x402-prelaunch-availability.yml",
      "utf8",
    );

    expect(workflow).toContain("workflow_run:");
    expect(workflow).toContain("- Production Website Health");
    expect(workflow).not.toContain("push:\n    branches:\n      - main");
    expect(workflow).toContain("github.event.workflow_run.conclusion == 'success'");
    expect(workflow).toContain("github.event.workflow_run.head_branch == 'main'");
    expect(workflow).toContain("WORKFLOW_RUN_SHA: ${{ github.event.workflow_run.head_sha }}");
    expect(workflow).toContain("ref: ${{ steps.release.outputs.sha }}");
    expect(workflow).toContain("Verify live build marker still matches accepted deployment");
    expect(workflow).toContain("X402_LIVE_BUILD_MARKER_SHA_MISMATCH");
    expect(workflow).toContain("GEOMACRO_X402_REQUIRE_REPRESENTATIVE_AVAILABLE:");
    expect(workflow).toContain("GEOMACRO_X402_COUNTRY_CENSUS_ENFORCE:");
  });

});
