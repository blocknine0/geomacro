import { createHash, randomBytes } from "node:crypto";

import { GEOMACRO_CREDIT_CONTRACT_VERSION } from "./commercial-access-contract";
import { requireRiskSupabase } from "./risk-supabase.server";
import { STRUCTURED_DATA_REGISTRY_VERSION } from "./structured-data-entitlement-registry";

export type TestnetIntegrationType = "product_api" | "ai_agent" | "automation" | "demo";

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export async function issueTestnetDeveloperApiKey(input: {
  principalId: string;
  label?: string;
  integrationType?: TestnetIntegrationType;
}) {
  const db = requireRiskSupabase();
  const now = new Date().toISOString();

  const profileQuery = await db
    .from("testnet_tester_profiles")
    .select("id,registration_status,access_status,current_entitlement_grant_id")
    .eq("principal_id", input.principalId)
    .maybeSingle();
  if (profileQuery.error) throw profileQuery.error;

  const profile = profileQuery.data;
  if (
    !profile ||
    profile.registration_status !== "complete" ||
    profile.access_status !== "active" ||
    !profile.current_entitlement_grant_id
  ) {
    throw new Error("TESTNET_TESTER_ACCESS_NOT_ACTIVE");
  }

  const grantQuery = await db
    .from("commercial_entitlement_grants")
    .select("id,tier,status,starts_at,ends_at,contract_version,metadata")
    .eq("id", profile.current_entitlement_grant_id)
    .eq("principal_id", input.principalId)
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
    grant.metadata?.offer_id !== "testnet_tester_pass_30d" ||
    grant.metadata?.structured_data_registry_version !== STRUCTURED_DATA_REGISTRY_VERSION
  ) {
    throw new Error("TESTNET_TESTER_ENTITLEMENT_NOT_ACTIVE");
  }

  const activeCredentials = await db
    .from("testnet_developer_credentials")
    .select("id")
    .eq("principal_id", input.principalId)
    .eq("enabled", true)
    .is("revoked_at", null);
  if (activeCredentials.error) throw activeCredentials.error;
  if ((activeCredentials.data ?? []).length >= 3) {
    throw new Error("TESTNET_DEVELOPER_KEY_LIMIT_REACHED");
  }

  const plaintext = `gmk_test_${randomBytes(32).toString("base64url")}`;
  const apiKeyHash = sha256(plaintext);
  const keyId = `gmk_test_${apiKeyHash.slice(0, 20)}`;

  const credentialInsert = await db
    .from("commercial_api_credentials")
    .insert({
      principal_id: input.principalId,
      key_id: keyId,
      api_key_hash: apiKeyHash,
      enabled: true,
      scopes: [
        "commercial:read",
        "testnet:structured",
        "testnet:risk-object",
        "testnet:risk-gate",
        "testnet:agent",
      ],
      expires_at: grant.ends_at,
    })
    .select("id,key_id,expires_at")
    .single();
  if (credentialInsert.error) throw credentialInsert.error;

  const mappingInsert = await db.from("testnet_developer_credentials").insert({
    principal_id: input.principalId,
    commercial_api_credential_id: credentialInsert.data.id,
    label: String(input.label ?? "Default test integration").trim().slice(0, 80),
    integration_type: input.integrationType ?? "product_api",
    enabled: true,
  });
  if (mappingInsert.error) {
    await db.from("commercial_api_credentials").delete().eq("id", credentialInsert.data.id);
    throw mappingInsert.error;
  }

  return {
    api_key: plaintext,
    key_id: credentialInsert.data.key_id,
    expires_at: credentialInsert.data.expires_at,
    shown_once: true,
    scopes: [
      "commercial:read",
      "testnet:structured",
      "testnet:risk-object",
      "testnet:risk-gate",
      "testnet:agent",
    ],
  } as const;
}

export async function revokeTestnetDeveloperApiKey(input: {
  principalId: string;
  credentialId: string;
}) {
  const db = requireRiskSupabase();
  const now = new Date().toISOString();

  const mapping = await db
    .from("testnet_developer_credentials")
    .select("id,commercial_api_credential_id")
    .eq("principal_id", input.principalId)
    .eq("commercial_api_credential_id", input.credentialId)
    .maybeSingle();
  if (mapping.error) throw mapping.error;
  if (!mapping.data) throw new Error("TESTNET_DEVELOPER_KEY_NOT_FOUND");

  const credentialUpdate = await db
    .from("commercial_api_credentials")
    .update({ enabled: false, revoked_at: now })
    .eq("id", input.credentialId)
    .eq("principal_id", input.principalId);
  if (credentialUpdate.error) throw credentialUpdate.error;

  const mappingUpdate = await db
    .from("testnet_developer_credentials")
    .update({ enabled: false, revoked_at: now })
    .eq("id", mapping.data.id);
  if (mappingUpdate.error) throw mappingUpdate.error;

  return { revoked: true, credential_id: input.credentialId } as const;
}
