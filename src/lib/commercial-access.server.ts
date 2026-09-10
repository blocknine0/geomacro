import {
  createHash,
} from "node:crypto";

import {
  GEOMACRO_ACCESS_TIERS,
  GEOMACRO_CREDIT_CONTRACT_VERSION,
  GEOMACRO_CREDIT_COSTS,
  type GeomacroCreditCapability,
} from "./commercial-access-contract";
import {
  canonicalGrantPolicy,
  type CanonicalGrantPolicy,
  type CommercialGrantMetadata,
} from "./commercial-entitlement-policy";
import {
  tierAllowsStructuredCapability,
} from "./structured-data-entitlement-registry";
import {
  requireRiskSupabase,
} from "./risk-supabase.server";

export type CommercialTierId = keyof typeof GEOMACRO_ACCESS_TIERS;

export type CommercialPrincipal = {
  principal_id: string;
  principal_type: string;
  principal_external_id: string;
  key_id: string;
  scopes: string[];
};

export type CommercialResolvedEntitlement = {
  grant_id: string;
  tier: CommercialTierId;
  source_type: string;
  source_reference: string | null;
  policy: CanonicalGrantPolicy;
};

export type CommercialCreditResult = {
  ok: boolean;
  idempotent_replay?: boolean;
  credit_cost?: number;
  credits_remaining?: number;
  period_ends_at?: string;
  code?: string;
};

export class CommercialAccessError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "CommercialAccessError";
    this.status = status;
    this.code = code;
  }
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function bearerToken(request: Request): string {
  const authorization = request.headers.get("authorization") ?? "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  const token = match?.[1]?.trim() ?? "";

  if (token.length < 24 || token.length > 512) {
    throw new CommercialAccessError(
      401,
      "COMMERCIAL_API_KEY_REQUIRED",
      "A valid Geomacro commercial API bearer key is required.",
    );
  }

  return token;
}

export function tierAllowsCapability(
  tier: CommercialTierId,
  capability: GeomacroCreditCapability,
): boolean {
  return tierAllowsStructuredCapability(tier, capability);
}

export function tierCreditAllocation(tier: CommercialTierId): number {
  const config = GEOMACRO_ACCESS_TIERS[tier];
  if ("credits_per_30_days" in config) return config.credits_per_30_days;
  return config.credits_per_month_starting_pool;
}

export async function authenticateCommercialApiRequest(
  request: Request,
): Promise<CommercialPrincipal> {
  const token = bearerToken(request);
  const db = requireRiskSupabase();
  const { data, error } = await db.rpc("resolve_commercial_api_principal", {
    p_api_key_hash: sha256(token),
  });

  if (error) {
    throw new CommercialAccessError(
      503,
      "COMMERCIAL_AUTH_UNAVAILABLE",
      "Commercial API authentication is temporarily unavailable.",
    );
  }

  const row = data as Record<string, unknown> | null;
  if (!row?.ok) {
    throw new CommercialAccessError(
      401,
      String(row?.code ?? "COMMERCIAL_API_KEY_DENIED"),
      "The commercial API credential is not authorized.",
    );
  }

  return {
    principal_id: String(row.principal_id),
    principal_type: String(row.principal_type),
    principal_external_id: String(row.principal_external_id),
    key_id: String(row.key_id),
    scopes: Array.isArray(row.scopes) ? row.scopes.map(String) : [],
  };
}

const TIER_PRIORITY: Record<CommercialTierId, number> = {
  free: 0,
  analyst_pilot: 1,
  api_pilot: 2,
  institutional: 3,
};

export async function resolveCommercialEntitlementForCapability(input: {
  principal: CommercialPrincipal;
  capability: GeomacroCreditCapability;
}): Promise<CommercialResolvedEntitlement> {
  const db = requireRiskSupabase();
  const now = new Date().toISOString();
  const { data, error } = await db
    .from("commercial_entitlement_grants")
    .select("id,tier,contract_version,source_type,source_reference,starts_at,ends_at,status,metadata")
    .eq("principal_id", input.principal.principal_id)
    .eq("status", "active")
    .eq("contract_version", GEOMACRO_CREDIT_CONTRACT_VERSION)
    .lte("starts_at", now)
    .gt("ends_at", now);

  if (error) {
    throw new CommercialAccessError(
      503,
      "COMMERCIAL_ENTITLEMENT_UNAVAILABLE",
      "Commercial entitlement could not be resolved.",
    );
  }

  const grants = (data ?? [])
    .map((row) => {
      const tier = String(row.tier);
      if (!(tier in GEOMACRO_ACCESS_TIERS)) return null;
      const typedTier = tier as CommercialTierId;
      const metadata =
        row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
          ? (row.metadata as CommercialGrantMetadata)
          : {};
      return {
        grant_id: String(row.id),
        tier: typedTier,
        source_type: String(row.source_type),
        source_reference: row.source_reference ? String(row.source_reference) : null,
        policy: canonicalGrantPolicy({
          tier: typedTier,
          metadata,
          capability: input.capability,
        }),
      } satisfies CommercialResolvedEntitlement;
    })
    .filter((grant): grant is CommercialResolvedEntitlement => grant !== null)
    .sort((a, b) => TIER_PRIORITY[b.tier] - TIER_PRIORITY[a.tier]);

  if (grants.length === 0) {
    throw new CommercialAccessError(
      403,
      "ACTIVE_ENTITLEMENT_REQUIRED",
      "This commercial API credential does not have an active Geomacro entitlement.",
    );
  }

  const allowed = grants.find((grant) => grant.policy.allowed);
  if (allowed) return allowed;

  if (grants.some((grant) => grant.policy.code === "REGISTRY_VERSION_MISMATCH")) {
    throw new CommercialAccessError(
      403,
      "ENTITLEMENT_REGISTRY_VERSION_MISMATCH",
      "This entitlement was created for a different structured-data registry version and must be reconciled before use.",
    );
  }

  throw new CommercialAccessError(
    403,
    "CAPABILITY_NOT_INCLUDED",
    "The requested capability is not included in the active Geomacro entitlement.",
  );
}

export async function ensureCommercialCreditAccount(input: {
  principal: CommercialPrincipal;
  tier: CommercialTierId;
}) {
  const db = requireRiskSupabase();
  const { data, error } = await db.rpc("ensure_commercial_credit_account", {
    p_principal_type: "api_client",
    p_principal_id: input.principal.principal_id,
    p_tier: input.tier,
    p_contract_version: GEOMACRO_CREDIT_CONTRACT_VERSION,
    p_included_credits: tierCreditAllocation(input.tier),
    p_period_days: 30,
  });

  if (error) {
    throw new CommercialAccessError(
      503,
      "COMMERCIAL_CREDIT_ACCOUNT_UNAVAILABLE",
      "Commercial credit account could not be resolved.",
    );
  }

  return data;
}

export async function consumeCommercialCapability(input: {
  principal: CommercialPrincipal;
  entitlement: CommercialResolvedEntitlement;
  requestId: string;
  capability: GeomacroCreditCapability;
}): Promise<CommercialCreditResult> {
  if (!input.entitlement.policy.allowed) {
    throw new CommercialAccessError(
      403,
      "CAPABILITY_NOT_INCLUDED",
      "The requested capability is not included in this Geomacro entitlement.",
    );
  }

  const creditCost = GEOMACRO_CREDIT_COSTS[input.capability];
  const db = requireRiskSupabase();
  const { data, error } = await db.rpc("consume_commercial_credits", {
    p_principal_type: "api_client",
    p_principal_id: input.principal.principal_id,
    p_request_id: input.requestId,
    p_capability: input.capability,
    p_credit_cost: creditCost,
    p_contract_version: GEOMACRO_CREDIT_CONTRACT_VERSION,
  });

  if (error) {
    throw new CommercialAccessError(
      503,
      "COMMERCIAL_USAGE_UNAVAILABLE",
      "Commercial usage accounting is temporarily unavailable.",
    );
  }

  const result = (data ?? {}) as CommercialCreditResult;
  if (!result.ok) {
    if (result.code === "INSUFFICIENT_CREDITS") {
      throw new CommercialAccessError(
        402,
        "INSUFFICIENT_CREDITS",
        "This account does not have enough Geomacro credits for the requested capability.",
      );
    }
    throw new CommercialAccessError(
      403,
      String(result.code ?? "COMMERCIAL_ACCESS_DENIED"),
      "Commercial access could not be granted.",
    );
  }

  return result;
}
