import type { GeomacroRiskObject } from "./risk-object-contract";
import type { RiskObjectDeliveryProfile } from "./public-demo-risk-profile";
import { getLatestCompatibleCountryRiskObjectAtOrBefore } from "./risk-object-store.server";
import { readB2LatestCanonicalCountryGro } from "./b2-country-gro.server";

/**
 * Resolve a country GRO from the authoritative Supabase store while it is
 * healthy. A verified private-B2 copy is outage continuity only: an explicit
 * healthy-store miss is never overridden by B2, and non-canonical profiles
 * never fall back across profile boundaries.
 */
export async function resolveCountryGroAtOrBefore(
  countryIso3: string,
  atOrBefore: string,
  deliveryProfile: RiskObjectDeliveryProfile = "CANONICAL",
): Promise<GeomacroRiskObject | null> {
  try {
    return await getLatestCompatibleCountryRiskObjectAtOrBefore(
      countryIso3,
      atOrBefore,
      deliveryProfile,
    );
  } catch {
    if (deliveryProfile !== "CANONICAL") return null;
    return await readB2LatestCanonicalCountryGro(countryIso3, atOrBefore);
  }
}
