import { randomBytes } from "node:crypto";

import { GEOMACRO_CREDIT_CONTRACT_VERSION } from "./commercial-access-contract";
import { apiCredentialDigest } from "./api-credential-hash.server";
import { requireRiskSupabase } from "./risk-supabase.server";
import {
  testnetDeveloperScopesForIntegration,
  type TestnetIntegrationType,
} from "./testnet-developer-scopes";
import { STRUCTURED_DATA_REGISTRY_VERSION } from "./structured-data-entitlement-registry";

export type { TestnetIntegrationType } from "./testnet-developer-scopes";

async function ensureMeteredEntitlement(principalId: string) {
  const db = requireRiskSupabase();
  const provision = await db.rpc("provision_testnet_metered_access", {
    p_principal_id: principalId,
    p_registry_version: STRUCTURED_DATA_REGISTRY_VERSION,
    p_contract_version: GEOMACRO_CREDIT_CONTRACT_VERSION,
  });
  if (provision.error) throw provision.error;
  const result = (provision.data ?? {}) as Record<string, unknown>;
  if (!result.ok) throw new Error(String(result.code ?? "TESTNET_METERED_ACCESS_PROVISION_FAILED"));
  return String(result.entitlement_grant_id ?? "");
}

async function ensureEligibleTestnetDeveloperPrincipal(principalId: string) {
  const db = requireRiskSupabase();
  const now = new Date().toISOString();

  const profileQuery = await db
    .from("testnet_tester_profiles")
    .select("id,registration_status,wallet_verified_at")
    .eq("principal_id", principalId)
    .maybeSingle();
  if (profileQuery.error) throw profileQuery.error;

  const profile = profileQuery.data;
  if (!profile || profile.registration_status !== "complete" || !profile.wallet_verified_at) {
    throw new Error("TESTNET_WALLET_VERIFICATION_REQUIRED");
  }

  const grantId = await ensureMeteredEntitlement(principalId);
  const grantQuery = await db
    .from("commercial_entitlement_grants")
    .select("id,tier,status,starts_at,ends_at,contract_version,metadata")
    .eq("id", grantId)
    .eq("principal_id", principalId)
    .maybeSingle();
  if (grantQuery.error) throw grantQuery.error;

  const grant = grantQuery.data;
  if (
    !grant ||
    grant.tier !== "testnet_tester" ||
    grant.status !== "active" ||
    grant.contract_version !== GEOMACRO_CREDIT_CONTRACT_VERSION ||
    grant.starts_at > now ||
    grant.ends_at <= now ||
    grant.metadata?.offer_id !== "testnet_tester_metered_30d" ||
    grant.metadata?.payment_model !== "pay_per_call" ||
    grant.metadata?.structured_data_registry_version !== STRUCTURED_DATA_REGISTRY_VERSION
  ) {
    throw new Error("TESTNET_TESTER_ENTITLEMENT_NOT_ACTIVE");
  }

  return grant;
}

async function hasUsableDeveloperCredential(principalId: string, now: string) {
  const db = requireRiskSupabase();
  const mappings = await db
    .from("testnet_developer_credentials")
    .select("commercial_api_credential_id")
    .eq("principal_id", principalId)
    .eq("enabled", true)
    .is("revoked_at", null)
    .order("created_at", { ascending: true });
  if (mappings.error) throw mappings.error;

  const credentialIds = (mappings.data ?? [])
    .map((row) => String(row.commercial_api_credential_id ?? ""))
    .filter(Boolean);
  if (!credentialIds.length) return false;

  const credentials = await db
    .from("commercial_api_credentials")
    .select("id,enabled,expires_at,revoked_at")
    .in("id", credentialIds)
    .eq("principal_id", principalId);
  if (credentials.error) throw credentials.error;

  return (credentials.data ?? []).some((credential) =>
    credential.enabled === true &&
    !credential.revoked_at &&
    (!credential.expires_at || String(credential.expires_at) > now)
  );
}

function newTestnetCredential() {
  const apiKey = `gmk_test_${randomBytes(20).toString("base64url")}`;
  const apiSecret = `gms_test_${randomBytes(32).toString("base64url")}`;
  return {
    apiKey,
    apiSecret,
    secretDigest: apiCredentialDigest(apiSecret, "testnet-api-secret"),
  } as const;
}

function publicCredentialResult(input: {
  apiKey: string;
  apiSecret: string;
  credentialId: string;
  expiresAt: string;
  scopes: string[];
  rotatedFromCredentialId?: string;
}) {
  return {
    api_key: input.apiKey,
    api_secret: input.apiSecret,
    key_id: input.apiKey,
    credential_id: input.credentialId,
    expires_at: input.expiresAt,
    shown_once: true,
    auth_scheme: "key_secret",
    payment_model: "pay_per_call",
    credit_price_testnet_usdc: 0.5,
    max_credits_per_30_days: 500,
    scopes: input.scopes,
    rotated_from_credential_id: input.rotatedFromCredentialId ?? null,
  } as const;
}

export async function issueTestnetDeveloperApiKey(input: {
  principalId: string;
  label?: string;
  integrationType?: TestnetIntegrationType;
}) {
  const db = requireRiskSupabase();
  const now = new Date().toISOString();
  const grant = await ensureEligibleTestnetDeveloperPrincipal(input.principalId);

  // Fast user-facing check; migration 928 independently locks the principal and
  // enforces the same invariant so concurrent requests cannot mint two live keys.
  if (await hasUsableDeveloperCredential(input.principalId, now)) {
    throw new Error("TESTNET_DEVELOPER_KEY_ALREADY_EXISTS");
  }

  const integrationType = input.integrationType ?? "product_api";
  const scopes = testnetDeveloperScopesForIntegration(integrationType);
  const generated = newTestnetCredential();
  const issued = await db.rpc("issue_testnet_developer_credential", {
    p_principal_id: input.principalId,
    p_key_id: generated.apiKey,
    p_api_key_hash: generated.secretDigest,
    p_scopes: scopes,
    p_expires_at: grant.ends_at,
    p_label: String(input.label ?? "Default test integration").trim().slice(0, 80),
    p_integration_type: integrationType,
  });
  if (issued.error) throw issued.error;
  const result = (issued.data ?? {}) as Record<string, unknown>;
  if (!result.ok) throw new Error(String(result.code ?? "TESTNET_DEVELOPER_KEY_ISSUE_FAILED"));

  return publicCredentialResult({
    apiKey: generated.apiKey,
    apiSecret: generated.apiSecret,
    credentialId: String(result.credential_id ?? ""),
    expiresAt: String(result.expires_at ?? grant.ends_at),
    scopes,
  });
}

export async function revokeTestnetDeveloperApiKey(input: {
  principalId: string;
  credentialId: string;
}) {
  const db = requireRiskSupabase();
  if (!/^[0-9a-fA-F-]{36}$/.test(input.credentialId)) {
    throw new Error("INVALID_TESTNET_DEVELOPER_CREDENTIAL_ID");
  }

  const revoked = await db.rpc("revoke_testnet_developer_credential", {
    p_principal_id: input.principalId,
    p_credential_id: input.credentialId,
  });
  if (revoked.error) throw revoked.error;
  const result = (revoked.data ?? {}) as Record<string, unknown>;
  if (!result.ok) throw new Error(String(result.code ?? "TESTNET_DEVELOPER_KEY_REVOKE_FAILED"));

  return {
    revoked: true,
    credential_id: input.credentialId,
    revoked_at: String(result.revoked_at ?? ""),
  } as const;
}

export async function rotateTestnetDeveloperApiKey(input: {
  principalId: string;
  credentialId: string;
}) {
  const db = requireRiskSupabase();
  if (!/^[0-9a-fA-F-]{36}$/.test(input.credentialId)) {
    throw new Error("INVALID_TESTNET_DEVELOPER_CREDENTIAL_ID");
  }

  const grant = await ensureEligibleTestnetDeveloperPrincipal(input.principalId);
  const mapping = await db
    .from("testnet_developer_credentials")
    .select("commercial_api_credential_id,label,integration_type,enabled,revoked_at")
    .eq("principal_id", input.principalId)
    .eq("commercial_api_credential_id", input.credentialId)
    .maybeSingle();
  if (mapping.error) throw mapping.error;
  if (!mapping.data || mapping.data.enabled !== true || mapping.data.revoked_at) {
    throw new Error("TESTNET_DEVELOPER_KEY_NOT_ACTIVE");
  }

  const integrationType = String(mapping.data.integration_type) as TestnetIntegrationType;
  if (!["product_api", "ai_agent", "automation", "demo"].includes(integrationType)) {
    throw new Error("INVALID_INTEGRATION_TYPE");
  }
  const scopes = testnetDeveloperScopesForIntegration(integrationType);
  const generated = newTestnetCredential();
  const rotated = await db.rpc("rotate_testnet_developer_credential", {
    p_principal_id: input.principalId,
    p_old_credential_id: input.credentialId,
    p_new_key_id: generated.apiKey,
    p_new_api_key_hash: generated.secretDigest,
    p_new_scopes: scopes,
    p_new_expires_at: grant.ends_at,
    p_label: String(mapping.data.label ?? "Default test integration").trim().slice(0, 80),
    p_integration_type: integrationType,
  });
  if (rotated.error) throw rotated.error;
  const result = (rotated.data ?? {}) as Record<string, unknown>;
  if (!result.ok) throw new Error(String(result.code ?? "TESTNET_DEVELOPER_KEY_ROTATE_FAILED"));

  return publicCredentialResult({
    apiKey: generated.apiKey,
    apiSecret: generated.apiSecret,
    credentialId: String(result.credential_id ?? ""),
    expiresAt: String(result.expires_at ?? grant.ends_at),
    scopes,
    rotatedFromCredentialId: input.credentialId,
  });
}
