import { requireRiskSupabase } from "./risk-supabase.server";
import { revokeTestnetDeveloperApiKey } from "./testnet-developer-access.server";

export async function listTestnetDeveloperApiKeys(principalId: string) {
  const db = requireRiskSupabase();
  const mappings = await db
    .from("testnet_developer_credentials")
    .select("id,commercial_api_credential_id,label,integration_type,enabled,created_at,revoked_at")
    .eq("principal_id", principalId)
    .order("created_at", { ascending: false });
  if (mappings.error) throw mappings.error;

  const rows = mappings.data ?? [];
  if (!rows.length) return [];
  const credentialIds = rows.map((row) => row.commercial_api_credential_id);
  const credentials = await db
    .from("commercial_api_credentials")
    .select("id,key_id,enabled,scopes,expires_at,last_used_at,created_at,revoked_at")
    .in("id", credentialIds)
    .eq("principal_id", principalId);
  if (credentials.error) throw credentials.error;
  const byId = new Map((credentials.data ?? []).map((row) => [row.id, row]));

  return rows.map((mapping) => {
    const credential = byId.get(mapping.commercial_api_credential_id);
    return {
      credential_id: mapping.commercial_api_credential_id,
      key_id: credential?.key_id ?? null,
      label: mapping.label,
      integration_type: mapping.integration_type,
      enabled: mapping.enabled === true && credential?.enabled === true,
      scopes: credential?.scopes ?? [],
      expires_at: credential?.expires_at ?? null,
      last_used_at: credential?.last_used_at ?? null,
      created_at: mapping.created_at,
      revoked_at: mapping.revoked_at ?? credential?.revoked_at ?? null,
    };
  });
}

export async function revokeOwnedTestnetDeveloperApiKey(input: {
  principalId: string;
  credentialId: string;
}) {
  if (!/^[0-9a-fA-F-]{36}$/.test(input.credentialId)) {
    throw new Error("INVALID_TESTNET_DEVELOPER_CREDENTIAL_ID");
  }
  return revokeTestnetDeveloperApiKey(input);
}
