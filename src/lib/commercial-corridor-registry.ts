import { corridorSubjectId } from "./corridor-risk-engine";

export const COMMERCIAL_CORRIDOR_REGISTRY_VERSION = "geomacro-corridor-registry-v1" as const;
export const COMMERCIAL_CORRIDOR_MODEL = "COUNTRY_PAIR_STRUCTURAL_V1" as const;

export type CommercialCorridorDescriptor = {
  registry_version: typeof COMMERCIAL_CORRIDOR_REGISTRY_VERSION;
  corridor_id: string;
  corridor_type: typeof COMMERCIAL_CORRIDOR_MODEL;
  origin_country_iso3: string;
  destination_country_iso3: string;
  composition_method: "ENDPOINT_COMPOSED_V0_1";
  route_modeling_status: "NOT_MODELED";
  corridor_score_status: "NOT_OFFERED_UNTIL_APPROVED_METHODOLOGY";
  missing_route_evidence_behavior: "EXPLICIT_UNAVAILABLE_OR_DEGRADED";
};

/**
 * Commercial corridor registry contract.
 *
 * A corridor is a stable directed pair of canonical ISO3 country nodes. The
 * registry is algorithmic rather than a 62k-row materialization: every pair of
 * distinct enabled country nodes can be addressed deterministically, while
 * actual delivery still fails closed unless governed structural evidence is
 * available for the requested endpoints.
 *
 * This descriptor deliberately does not claim route/chokepoint modeling or a
 * corridor risk score. Those remain unavailable until a separately approved,
 * versioned methodology and route evidence are certified.
 */
export function commercialCorridorDescriptor(input: {
  origin_country_iso3: string;
  destination_country_iso3: string;
}): CommercialCorridorDescriptor {
  const corridorId = corridorSubjectId(
    input.origin_country_iso3,
    input.destination_country_iso3,
  );
  const [origin, destination] = corridorId.split(">");
  if (!origin || !destination) throw new Error("COMMERCIAL_CORRIDOR_ID_INVALID");

  return {
    registry_version: COMMERCIAL_CORRIDOR_REGISTRY_VERSION,
    corridor_id: corridorId,
    corridor_type: COMMERCIAL_CORRIDOR_MODEL,
    origin_country_iso3: origin,
    destination_country_iso3: destination,
    composition_method: "ENDPOINT_COMPOSED_V0_1",
    route_modeling_status: "NOT_MODELED",
    corridor_score_status: "NOT_OFFERED_UNTIL_APPROVED_METHODOLOGY",
    missing_route_evidence_behavior: "EXPLICIT_UNAVAILABLE_OR_DEGRADED",
  };
}
