import type { GeomacroRiskObject } from "./risk-object-contract";
import type { RiskObjectDeliveryProfile } from "./public-demo-risk-profile";
import { getLatestCompatibleCountryRiskObjectAtOrBefore } from "./risk-object-store.server";
import { readD1VerifiedHotCountryGro } from "./d1-country-gro-hot.server";

/**
 * Canonical commercial country-GRO reads use the independently verified D1 hot
 * copy first. The hot row contains the exact canonical signed GRO bytes and is
 * admitted only after local signature/commercial verification, acknowledged B2
 * archive write, and D1 readback/hash verification. Backblaze remains the cold
 * durable archive, but a B2 GET is never a synchronous customer/Federico gate.
 *
 * Non-canonical profiles and explicit recovery continue through the original
 * profile-aware store path. Missing/expired/tampered hot rows fail closed.
 */
export async function resolveCountryGroAtOrBefore(
  countryIso3: string,
  atOrBefore: string,
  deliveryProfile: RiskObjectDeliveryProfile = "CANONICAL",
): Promise<GeomacroRiskObject | null> {
  if (deliveryProfile === "CANONICAL") {
    const hot = await readD1VerifiedHotCountryGro(countryIso3, atOrBefore);
    if (hot) return hot;
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
