import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  STRUCTURAL_METHODOLOGY_STATUS,
  latestStructuralObservations,
  type StructuralObservation,
} from "../lib/structural-context.server";

const ROOT = process.cwd();

function row(
  overrides: Partial<StructuralObservation> & Pick<StructuralObservation, "observation_id">,
): StructuralObservation {
  return {
    observation_id: overrides.observation_id,
    source_id: overrides.source_id ?? "test-source",
    source_record_id: overrides.source_record_id ?? null,
    dimension: overrides.dimension ?? "conflict_exposure",
    country_iso3: overrides.country_iso3 ?? "USA",
    partner_country_iso3: overrides.partner_country_iso3 ?? null,
    observed_at: overrides.observed_at ?? "2026-01-01T00:00:00.000Z",
    published_at: overrides.published_at ?? null,
    metric: overrides.metric ?? "events",
    value_numeric: overrides.value_numeric ?? 1,
    value_text: overrides.value_text ?? null,
    unit: overrides.unit ?? "count",
    event_type: overrides.event_type ?? null,
    signal_type: overrides.signal_type ?? null,
    source_url: overrides.source_url ?? "https://example.com/source",
    parser_version: overrides.parser_version ?? "test-v1",
    methodology_status:
      overrides.methodology_status ?? STRUCTURAL_METHODOLOGY_STATUS,
    quality_status: overrides.quality_status ?? "verified",
    provenance: overrides.provenance ?? {},
    normalized_hash: overrides.normalized_hash ?? "a".repeat(64),
    retrieved_at: overrides.retrieved_at ?? "2026-01-02T00:00:00.000Z",
  };
}

describe("structural context contract", () => {
  it("keeps structural evidence explicitly outside GRI v1.2 scoring", () => {
    expect(STRUCTURAL_METHODOLOGY_STATUS).toBe(
      "EVIDENCE_ONLY_NOT_IN_GRI_V1_2",
    );
  });

  it("selects the newest observation per dimension/metric/country pair", () => {
    const result = latestStructuralObservations([
      row({
        observation_id: "old",
        observed_at: "2025-01-01T00:00:00.000Z",
      }),
      row({
        observation_id: "new",
        observed_at: "2026-01-01T00:00:00.000Z",
      }),
      row({
        observation_id: "different-metric",
        metric: "fatalities",
        observed_at: "2025-06-01T00:00:00.000Z",
      }),
    ]);

    expect(result.map((item) => item.observation_id)).toEqual([
      "new",
      "different-metric",
    ]);
  });

  it("never queries the private raw structural table", () => {
    const source = readFileSync(
      join(ROOT, "src/lib/structural-context.server.ts"),
      "utf8",
    );

    expect(source).toContain(
      '.from("commercial_structural_geopolitical_observations")',
    );
    expect(source).not.toMatch(
      /\.from\(["']structural_geopolitical_observations["']\)/,
    );
  });

  it("does not let a busy macro dimension erase available geopolitical/mineral evidence",()=>{
    const macro=Array.from({length:30},(_,i)=>row({
      observation_id:"macro-"+i,dimension:"macro_monetary",metric:"metric-"+i,
      observed_at:"2026-01-03T00:00:00.000Z",
    }));
    const mineral=row({observation_id:"mineral",dimension:"critical_minerals",metric:"production"});
    const geopolitical=row({observation_id:"security",dimension:"geopolitical_security",metric:"events"});
    const input=[...macro,mineral,geopolitical];
    const result=latestStructuralObservations(input,12);
    expect(result).toHaveLength(12);
    expect(new Set(result.map(x=>x.dimension))).toEqual(new Set([
      "macro_monetary","critical_minerals","geopolitical_security",
    ]));
    expect(result.map(x=>x.observation_id)).toContain("macro-0");
    expect(input).toEqual([...macro,mineral,geopolitical]);
    expect(latestStructuralObservations(input,0)).toEqual([]);
  });

  it("preserves every available dimension when the bounded profile can hold them",()=>{
    const dimensions=["sovereign_fiscal","political_governance","macro_monetary","external_fx",
      "sanctions_restrictions","geopolitical_security","trade_corridor","energy_commodities",
      "critical_minerals","banking_financial_system","food_agriculture","natural_hazards"];
    const input=dimensions.flatMap((dimension,n)=>Array.from({length:5},(_,i)=>row({
      observation_id:dimension+"-"+i,dimension,metric:"metric-"+i,
      observed_at:new Date(Date.UTC(2026,0,1+n)).toISOString(),
    })));
    expect(new Set(latestStructuralObservations(input,12).map(x=>x.dimension)))
      .toEqual(new Set(dimensions));
  });

  it("does not let newly retrieved undated/future duplicates evict a usable original",()=>{
    const current=row({observation_id:"dated",observed_at:"2026-01-02T00:00:00Z"});
    const undated={...current,observation_id:"retrieval-only",observed_at:null,
      published_at:null,retrieved_at:new Date().toISOString()};
    const future={...current,observation_id:"future",observed_at:"2999-01-01T00:00:00Z"};
    const invalid={...current,observation_id:"invalid",observed_at:"invalid"};
    expect(latestStructuralObservations([undated,future,invalid,current],1))
      .toEqual([current]);
    const mixedClocks={...current,observation_id:"old-native",observed_at:"2026-01-03T00:00:00Z",
      published_at:"2024-01-01T00:00:00Z"};
    expect(latestStructuralObservations([mixedClocks,current],1)).toEqual([current]);
  });

  it("requires historical service credentials to stay server-only", () => {
    const source = readFileSync(
      join(ROOT, "src/lib/structural-context.server.ts"),
      "utf8",
    );

    expect(source).toContain("HISTORICAL_SUPABASE_URL");
    expect(source).toContain("HISTORICAL_SUPABASE_SERVICE_ROLE_KEY");
    expect(source).not.toContain("VITE_HISTORICAL_");
  });
});
