import type { GeomacroRiskObject } from "./risk-object-contract";
import type { RiskObjectDeliveryProfile } from "./public-demo-risk-profile";
import { getLatestCompatibleCountryRiskObjectAtOrBefore } from "./risk-object-store.server";
import { readB2LatestCanonicalCountryGro } from "./b2-country-gro.server";

/**
 * Canonical commercial country-GRO reads are B2-first so customer/runtime
 * delivery does not wait on or require Supabase. The private B2 continuity
 * package is independently verified before it is returned.
 *
 * Non-canonical profiles remain on the original profile-aware store path. For
 * canonical reads, Supabase is retained only as an explicit recovery source
 * when the verified B2 continuity package is unavailable.
 */
export async function resolveCountryGroAtOrBefore(
  countryIso3: string,
  atOrBefore: string,
  deliveryProfile: RiskObjectDeliveryProfile = "CANONICAL",
): Promise<GeomacroRiskObject | null> {
  if (deliveryProfile === "CANONICAL") {
    const b2 = await readB2LatestCanonicalCountryGro(countryIso3, atOrBefore);
    if (b2) return b2;
  }

  try {
    return await getLatestCompatibleCountryRiskObjectAtOrBefore(
      countryIso3,
      atOrBefore,
      deliveryProfile,
    );
  } catch {
    return null;
  }
}
