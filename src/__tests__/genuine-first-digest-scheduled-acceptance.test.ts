import {readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";
import {GEOMACRO_CAPABILITY_PRICES} from "../lib/capability-pricing-catalog";
import {geomacroStructuredOutputCatalog,publicGeomacroStructuredOutputCatalog} from "../lib/capability-structured-output-contract";
import {quoteGeomacroUsdcCapabilityPreflight} from "../lib/geomacro-multichain-usdc.server";
import {GEOMACRO_USDC_NATIVE_RAILS} from "../lib/usdc-native-rail-identities";

const workflow=readFileSync(".github/workflows/first-qualified-country-digest.yml","utf8");
const proofScript=readFileSync("scripts/ops/prepare-first-qualified-country-digest.ts","utf8");
const source=readFileSync("src/lib/qualified-mcs-country-digest.server.ts","utf8");

describe("genuine first paid-capability source acceptance, strictly no funds",()=>{
  it("checks actual current CC0 pinned source and customer SHA daily on protected main",()=>{
    expect(workflow).toContain('cron: "23 3 * * *"');
    expect(workflow).toContain("github.ref == 'refs/heads/main'");
    expect(workflow).toContain("GEOMACRO_FIRST_DIGEST_COUNTRY: CHN");
    expect(workflow).toContain("Assert genuine structured customer bytes proof without funds");
    expect(workflow).toContain("FIRST_DIGEST_GENUINE_NO_FUNDS_ACCEPTANCE_FAILED");
    expect(workflow).toContain("source_rights_verified!==true");
    expect(workflow).toContain("original_file_sha256_verified!==true");
    expect(workflow).toContain("settlement_attempts!==0");
    expect(workflow).toContain("execution_authorized!==false");
    expect(workflow).toContain("retention-days: 3");
    expect(workflow).not.toContain("COINBASE_X402_MAINNET_ACK: \u0024{{ secrets.");
    expect(workflow).not.toContain("SUPABASE_DB_URL: \u0024{{ secrets.");
  });
  it("preserves manual governed B2 exact archive path without scheduled writes",()=>{
    expect(workflow).toContain("qualify-and-archive:");
    expect(workflow).toContain("github.event_name == 'workflow_dispatch'");
    expect(workflow).toContain("environment: production");
    expect(workflow).toContain("B2_ACCOUNT_QUOTA_REQUIRED: '1'");
    expect(workflow).toContain("B2_REQUEST_BUDGET: '8'");
    expect(workflow).toContain("--archive-private");
    expect(proofScript).toContain("private_immutable_archive_verified: archived");
    expect(proofScript).toContain("settlement_attempts: 0");
    expect(proofScript).toContain('private_immutable_delivery_bytes_verified: archived || vaultVerified');
  });
  it("uses actual year-bounded derived annual mineral source, not fresh news",()=>{
    expect(source).toContain("verifyMcsCc0Metadata");
    expect(source).toContain("MCS_DIGEST_CSV_SHA256");
    expect(source).toContain('a.rightsList[0]?.rightsIdentifier !== "cc0-1.0"');
    expect(source).toContain('year !== 2024 && year !== 2025');
    expect(source).toContain('ANNUAL_STRUCTURAL_NOT_CURRENT_NEWS');
    expect(proofScript).toContain('resolveGeomacroCapabilityPrice("structural_country_digest", "standard")');
    expect(proofScript).toContain('price.amount_atomic !== "20000"');
    expect(proofScript).toContain("prepared_answer_sha256: hash");
  });
  it("keeps every locked price and 14 structured variants identical on all 3 USDC previews",()=>{
    expect(geomacroStructuredOutputCatalog()).toHaveLength(14); // immutable historical contracts
    const outputs=publicGeomacroStructuredOutputCatalog();
    expect(outputs).toHaveLength(12);
    let checks=0;
    for(const output of outputs){
      for(const net of Object.keys(GEOMACRO_USDC_NATIVE_RAILS)){
        const q=quoteGeomacroUsdcCapabilityPreflight({
          network:net,capability:output.capability,variant:output.variant,
        });
        expect(q.amount_usdc).toBe(output.amount_usdc);
        expect(q.amount_atomic).toMatch(/^[0-9]+$/);
        expect(q.quotation_type).toBe("NON_PAYABLE_CATALOG_PREVIEW");
        expect(q.payment_requirement_issued).toBe(false);
        expect(q.money_transferred).toBe(false);
        expect(q.payment_authorized).toBe(false);
        expect(q.chargeable).toBe(false);
        expect(output.raw_source_payload).toBe(false);
        expect(output.customer_receives.length).toBeGreaterThanOrEqual(3);
        checks++;
      }
    }
    expect(Object.keys(GEOMACRO_CAPABILITY_PRICES)).toHaveLength(8);
    expect(checks).toBe(36);
  });
});
