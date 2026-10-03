import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");
const producer = JSON.parse(read("config/historical-data-producer.v1.json"));
const registry = JSON.parse(read("global-intelligence/sources/historical-data.registry.v1.json"));
const adapter = read("global-intelligence/adapters/historical-data.mjs");
const structural = read("src/lib/structural-context.server.ts");

describe("geomacro-historical-data producer link", () => {
  it("pins the private producer repository and reciprocal integration contract", () => {
    expect(producer.producer_repository).toBe("blocknine0/geomacro-historical-data");
    expect(producer.producer_main_commit).toMatch(/^[a-f0-9]{40}$/);
    expect(producer.producer_contract).toBe("docs/HISTORICAL_INTEGRATION_CONTRACT.md");
    expect(producer.producer_consumer_manifest).toBe("config/geomacro_main_consumer.v1.json");
    expect(registry.repository).toBe(producer.producer_repository);
    expect(registry.repository_main_commit).toBe(producer.producer_main_commit);
    expect(registry.status).toBe("CONNECTED_CURATED_SERVER_ONLY");
  });

  it("keeps every historical domain on governed server-only serving interfaces", () => {
    for (const table of Object.values(producer.serving_interfaces) as string[]) {
      expect(adapter + structural).toContain(table);
    }
    expect(producer.runtime_path.raw_private_repository_fetch).toBe(false);
    expect(registry.browser_access).toBe(false);
    expect(registry.raw_warehouse_access).toBe(false);
    expect(adapter).toContain("HISTORICAL_SUPABASE_URL");
    expect(adapter).toContain("HISTORICAL_SUPABASE_SERVICE_ROLE_KEY");
    expect(adapter).not.toContain("VITE_HISTORICAL_");
    expect(structural).not.toContain("VITE_HISTORICAL_");
  });

  it("preserves the frozen methodology and missing-data boundaries", () => {
    expect(producer.methodology_boundary).toBe(
      "EVIDENCE_ONLY_NOT_IN_GRI_OR_GRO_UNTIL_SEPARATELY_VERSIONED",
    );
    expect(producer.missing_data_semantics).toBe("MISSING_IS_NOT_ZERO");
    expect(producer.current_source_override).toBe(false);
    expect(registry.missing_is_not_zero).toBe(true);
    expect(registry.current_source_override).toBe(false);
  });
});
