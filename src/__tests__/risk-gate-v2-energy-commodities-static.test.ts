import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const ingest = readFileSync("scripts/ingest-usgs-mcs-live.mjs", "utf8");
const manifest = readFileSync(
  "scripts/record-usgs-mcs-extraction-manifest.mjs",
  "utf8",
);
const server = readFileSync(
  "src/lib/risk-gate-v2-energy-commodities-module-state.server.ts",
  "utf8",
);
const aliases = readFileSync(
  "supabase/migrations/920_usgs_country_aliases.sql",
  "utf8",
);

const SOURCE_HASH =
  "582a0aa231aea53d8a97dc8d1cd3dfa5f885cf3760353e3d029d7f0ae4fbaaf5";

describe("Risk Gate v2 energy/commodities source boundaries", () => {
  it("pins the exact official MCS release identity in ingestion and manifest generation", () => {
    expect(ingest).toContain('const EXPECTED_SOURCE_FILE = "MCS2026_Commodities_Data.csv"');
    expect(ingest).toContain(SOURCE_HASH);
    expect(ingest).toContain('new TextDecoder("windows-1252")');
    expect(manifest).toContain('const FILE = "MCS2026_Commodities_Data.csv"');
    expect(manifest).toContain(SOURCE_HASH);
    expect(manifest).toContain('new TextDecoder("windows-1252")');
  });

  it("uses exact extraction-series semantics instead of broad production matching", () => {
    expect(manifest).toContain('statistic === "production"');
    expect(manifest).toContain('detail.includes("mine production")');
    expect(manifest).toContain('!detail.includes("rounded")');
    expect(manifest).toContain('!detail.includes("refinery")');
    expect(manifest).toContain('!detail.includes("smelter")');
    expect(manifest).toContain('!detail.includes("secondary")');
    expect(manifest).not.toContain('statistic.includes("production")');
  });

  it("keeps the aggregate residual explicit and does not invent an ISO sovereign", () => {
    expect(ingest).toContain('aggregate_bucket: isOtherCountriesAggregate');
    expect(ingest).toContain('"OTHER_COUNTRIES"');
    expect(ingest).toContain('countryIso3: iso3');
    expect(manifest).toContain(
      'canonical(sourceCountryLabel) === "other countries"',
    );
    expect(manifest).toContain(
      "it is never treated as a sovereign producer",
    );
  });

  it("requires deterministic pinned source-row identity and excludes legacy rows", () => {
    expect(manifest).toContain("provenance.source_file_sha256 === FILE_SHA256");
    expect(manifest).toContain(
      'typeof provenance.source_row_sha256 === "string"',
    );
    expect(server).toContain("Old MCS rows did not carry the");
    expect(server).toContain(
      "pinned file hash/source-row hash and therefore cannot enter v2 scoring.",
    );
    expect(server).toContain(
      "sourceFileHash !== RISK_GATE_V2_USGS_MCS_SOURCE_FILE_SHA256",
    );
  });

  it("adds only source-label aliases while leaving aggregate residuals out of the country registry", () => {
    expect(aliases).toContain("'Turkey'");
    expect(aliases).toContain("'Congo (Kinshasa)'");
    expect(aliases).toContain("'Korea, North'");
    expect(aliases).toContain("'Côte d’Ivoire'");
    expect(aliases).not.toContain("Other countries");
  });
});
