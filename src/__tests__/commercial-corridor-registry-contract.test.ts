import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  COMMERCIAL_CORRIDOR_MODEL,
  COMMERCIAL_CORRIDOR_REGISTRY_VERSION,
  commercialCorridorDescriptor,
} from "../lib/commercial-corridor-registry";

const route = readFileSync("server/api/commercial/structural.post.ts", "utf8");
const migration = readFileSync(
  "supabase/migrations/20261004174500_commercial_corridor_registry_status.sql",
  "utf8",
);

describe("#1414 commercial corridor registry", () => {
  it("uses stable directed ISO3 pair identities without pretending route modeling", () => {
    const descriptor = commercialCorridorDescriptor({
      origin_country_iso3: "usa",
      destination_country_iso3: "chn",
    });

    expect(COMMERCIAL_CORRIDOR_REGISTRY_VERSION).toBe("geomacro-corridor-registry-v1");
    expect(COMMERCIAL_CORRIDOR_MODEL).toBe("COUNTRY_PAIR_STRUCTURAL_V1");
    expect(descriptor.corridor_id).toBe("USA>CHN");
    expect(descriptor.origin_country_iso3).toBe("USA");
    expect(descriptor.destination_country_iso3).toBe("CHN");
    expect(descriptor.composition_method).toBe("ENDPOINT_COMPOSED_V0_1");
    expect(descriptor.route_modeling_status).toBe("NOT_MODELED");
    expect(descriptor.corridor_score_status).toBe(
      "NOT_OFFERED_UNTIL_APPROVED_METHODOLOGY",
    );
    expect(() =>
      commercialCorridorDescriptor({
        origin_country_iso3: "USA",
        destination_country_iso3: "USA",
      }),
    ).toThrow("Corridor endpoints must be different countries");
  });

  it("exposes the registry descriptor only through the structured derived boundary", () => {
    expect(route).toContain("commercialCorridorDescriptor");
    expect(route).toContain("corridor_registry: corridorRegistry");
    expect(route).toContain('delivery_boundary: "STRUCTURED_DERIVED_INTELLIGENCE_ONLY"');
    expect(route).toContain("source_identity_included: false");
    expect(route).toContain("internal_provenance_included: false");
    expect(route).toContain("execution_authorized: false");
  });

  it("keeps the global pair census algorithmic and named routes unpromoted", () => {
    expect(migration).toContain("ORIGIN_ISO3>DESTINATION_ISO3");
    expect(migration).toContain("enabled_country_count * greatest(c.enabled_country_count - 1, 0)");
    expect(migration).toContain("enabled_country_count >= 195");
    expect(migration).toContain("195 * 194");
    expect(migration).toContain("named_route_data_promoted_rows");
    expect(migration).toContain("NOT_MODELED");
    expect(migration).toContain("NOT_OFFERED_UNTIL_APPROVED_METHODOLOGY");
    expect(migration).not.toContain("corridor_score numeric");
  });
});
