import type { GeomacroCreditCapability } from "./commercial-access-contract";
import {
  COMMERCIAL_OFFER_REGISTRY,
  STRUCTURED_DATA_REGISTRY_VERSION,
  structuredDeliveryPolicy,
  type CommercialOfferId,
  type StructuredDataTierId,
} from "./structured-data-entitlement-registry";

export type CommercialGrantMetadata = Record<string, unknown>;

export type CanonicalGrantPolicy = {
  allowed: boolean;
  code:
    | "ALLOWED"
    | "TIER_NOT_API_ENABLED"
    | "REGISTRY_VERSION_MISMATCH"
    | "UNKNOWN_OFFER"
    | "OFFER_TIER_MISMATCH"
    | "ONE_SHOT_CAPABILITY_MISMATCH";
  offer_id: CommercialOfferId | null;
  entitlement_kind:
    | "legacy_tier"
    | "subscription"
    | "contract"
    | "one_shot"
    | "public_web"
    | "testnet_pass";
  one_shot_capability: GeomacroCreditCapability | null;
};

function isOfferId(value: unknown): value is CommercialOfferId {
  return typeof value === "string" && value in COMMERCIAL_OFFER_REGISTRY;
}

export function canonicalGrantPolicy(input: {
  tier: StructuredDataTierId;
  metadata?: CommercialGrantMetadata | null;
  capability: GeomacroCreditCapability;
}): CanonicalGrantPolicy {
  const base = structuredDeliveryPolicy(input.tier, input.capability);
  if (!base.allowed) {
    return {
      allowed: false,
      code: "TIER_NOT_API_ENABLED",
      offer_id: null,
      entitlement_kind: "legacy_tier",
      one_shot_capability: null,
    };
  }

  const metadata = input.metadata ?? {};
  const registryVersion = metadata.structured_data_registry_version;
  if (
    typeof registryVersion === "string" &&
    registryVersion !== STRUCTURED_DATA_REGISTRY_VERSION
  ) {
    return {
      allowed: false,
      code: "REGISTRY_VERSION_MISMATCH",
      offer_id: null,
      entitlement_kind: "legacy_tier",
      one_shot_capability: null,
    };
  }

  const rawOfferId = metadata.offer_id;
  if (rawOfferId === undefined || rawOfferId === null || rawOfferId === "") {
    return {
      allowed: true,
      code: "ALLOWED",
      offer_id: null,
      entitlement_kind: "legacy_tier",
      one_shot_capability: null,
    };
  }

  if (!isOfferId(rawOfferId)) {
    return {
      allowed: false,
      code: "UNKNOWN_OFFER",
      offer_id: null,
      entitlement_kind: "legacy_tier",
      one_shot_capability: null,
    };
  }

  const offer = COMMERCIAL_OFFER_REGISTRY[rawOfferId];
  if (offer.tier !== input.tier) {
    return {
      allowed: false,
      code: "OFFER_TIER_MISMATCH",
      offer_id: rawOfferId,
      entitlement_kind: offer.entitlement_kind,
      one_shot_capability:
        "one_shot_capability" in offer ? offer.one_shot_capability : null,
    };
  }

  const oneShotCapability =
    "one_shot_capability" in offer ? offer.one_shot_capability : null;
  if (offer.entitlement_kind === "one_shot" && oneShotCapability !== input.capability) {
    return {
      allowed: false,
      code: "ONE_SHOT_CAPABILITY_MISMATCH",
      offer_id: rawOfferId,
      entitlement_kind: offer.entitlement_kind,
      one_shot_capability: oneShotCapability,
    };
  }

  return {
    allowed: true,
    code: "ALLOWED",
    offer_id: rawOfferId,
    entitlement_kind: offer.entitlement_kind,
    one_shot_capability: oneShotCapability,
  };
}
