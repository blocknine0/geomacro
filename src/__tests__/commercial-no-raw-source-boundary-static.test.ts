import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const contract = readFileSync("src/lib/geomacro-intelligence-contract.ts", "utf8");

describe("#1414 permanent commercial no-raw/no-source boundary", () => {
  it("rejects upstream identity and raw payload keys recursively", () => {
    for (const forbidden of [
      '"source"', '"source_id"', '"source_name"', '"source_url"',
      '"publisher"', '"provider"', '"provider_name"', '"raw_data"',
      '"raw_payload"', '"raw_content"', '"article_url"', '"feed_url"',
      '"endpoint_url"', '"archive_url"', '"b2_key"', '"storage_path"',
      '"provenance_blob"',
    ]) {
      expect(contract).toContain(forbidden);
    }
    expect(contract).toContain("assertNoRawSourceLeak(child");
    expect(contract).toContain("INTELLIGENCE_RESPONSE_RAW_SOURCE_LEAK:");
  });

  it("runs the leak detector before accepting the paid product contract", () => {
    const objectCheck = contract.indexOf('if (!isRecord(payload)) throw new Error("INTELLIGENCE_RESPONSE_NOT_OBJECT")');
    const leakCheck = contract.indexOf("assertNoRawSourceLeak(payload)");
    const schemaCheck = contract.indexOf("INTELLIGENCE_RESPONSE_SCHEMA_VERSION_MISMATCH");
    expect(objectCheck).toBeGreaterThanOrEqual(0);
    expect(leakCheck).toBeGreaterThan(objectCheck);
    expect(schemaCheck).toBeGreaterThan(leakCheck);
  });

  it("keeps the existing derived-only explicit boundaries", () => {
    expect(contract).toContain("STRUCTURED_DERIVED_CHANGE_INTELLIGENCE_ONLY");
    expect(contract).toContain("DERIVED_DECISION_INTELLIGENCE_ONLY");
    expect(contract).toContain("SIGNED_RISK_OBJECT_ATTESTATION_ONLY");
    expect(contract).toContain("raw_data_delivered !== false");
  });
});
