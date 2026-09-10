import { createHash } from "node:crypto";

import { requireRiskSupabase } from "./risk-supabase.server";

export const TESTNET_TESTER_TERMS_VERSION = "testnet-tester-terms-v1" as const;

function sha256Canonical(value: string) {
  return createHash("sha256").update(value.trim().toLowerCase(), "utf8").digest("hex");
}

function requireUuid(value: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new Error("INVALID_PRINCIPAL_ID");
  }
  return value;
}

function requireEmail(value: string) {
  const email = value.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("INVALID_EMAIL");
  }
  return email;
}

function requireWallet(value: string) {
  const wallet = value.trim().toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(wallet)) throw new Error("INVALID_WALLET_ADDRESS");
  return wallet;
}

function requireProviderId(value: string, code: string) {
  const id = value.trim();
  if (id.length < 2 || id.length > 128) throw new Error(code);
  return id;
}

function requireProfileName(value: string) {
  const name = value.replace(/\s+/g, " ").trim();
  if (name.length < 2 || name.length > 64) throw new Error("INVALID_PROFILE_NAME");
  return name;
}

function normalizeAvatarPath(value?: string | null) {
  if (!value) return null;
  const path = value.trim();
  if (path.length > 240 || path.includes("..") || /^https?:\/\//i.test(path)) {
    throw new Error("INVALID_AVATAR_PATH");
  }
  return path;
}

/**
 * Persists a completed Testnet tester registration only after the transport
 * layer has independently verified the email, wallet signature, X account and
 * Discord account. This function deliberately accepts no raw OAuth tokens,
 * passwords, wallet signatures or email magic-link tokens.
 */
export async function persistVerifiedTestnetTesterRegistration(input: {
  principal_id: string;
  email: string;
  wallet_address: string;
  x_account_id: string;
  discord_account_id: string;
  profile_name: string;
  avatar_path?: string | null;
  terms_version?: string;
  verified_at?: string;
}) {
  const principalId = requireUuid(input.principal_id);
  const email = requireEmail(input.email);
  const wallet = requireWallet(input.wallet_address);
  const xId = requireProviderId(input.x_account_id, "INVALID_X_ACCOUNT_ID");
  const discordId = requireProviderId(input.discord_account_id, "INVALID_DISCORD_ACCOUNT_ID");
  const profileName = requireProfileName(input.profile_name);
  const avatarPath = normalizeAvatarPath(input.avatar_path);
  const verifiedAt = input.verified_at ?? new Date().toISOString();
  const termsVersion = String(input.terms_version ?? TESTNET_TESTER_TERMS_VERSION).trim();
  if (termsVersion !== TESTNET_TESTER_TERMS_VERSION) throw new Error("TESTNET_TERMS_VERSION_MISMATCH");

  const db = requireRiskSupabase();
  const principal = await db
    .from("commercial_principals")
    .select("id,status")
    .eq("id", principalId)
    .maybeSingle();
  if (principal.error) throw principal.error;
  if (!principal.data || principal.data.status !== "active") {
    throw new Error("TESTNET_PRINCIPAL_NOT_ACTIVE");
  }

  const payload = {
    principal_id: principalId,
    profile_name: profileName,
    avatar_path: avatarPath,
    email_hash: sha256Canonical(email),
    email_verified_at: verifiedAt,
    wallet_address_hash: sha256Canonical(wallet),
    wallet_verified_at: verifiedAt,
    x_account_id_hash: sha256Canonical(xId),
    x_connected_at: verifiedAt,
    discord_account_id_hash: sha256Canonical(discordId),
    discord_connected_at: verifiedAt,
    terms_version: termsVersion,
    terms_accepted_at: verifiedAt,
    registration_status: "complete",
    access_status: "awaiting_payment",
    updated_at: verifiedAt,
  } as const;

  const existing = await db
    .from("testnet_tester_profiles")
    .select("id,access_status,current_payment_event_id,current_entitlement_grant_id")
    .eq("principal_id", principalId)
    .maybeSingle();
  if (existing.error) throw existing.error;

  if (existing.data) {
    const preserveActive = existing.data.access_status === "active";
    const update = await db
      .from("testnet_tester_profiles")
      .update({
        ...payload,
        access_status: preserveActive ? "active" : "awaiting_payment",
        current_payment_event_id: existing.data.current_payment_event_id,
        current_entitlement_grant_id: existing.data.current_entitlement_grant_id,
      })
      .eq("id", existing.data.id)
      .select("id,registration_status,access_status")
      .single();
    if (update.error) throw update.error;
    return update.data;
  }

  const inserted = await db
    .from("testnet_tester_profiles")
    .insert(payload)
    .select("id,registration_status,access_status")
    .single();
  if (inserted.error) throw inserted.error;
  return inserted.data;
}

export async function getTestnetTesterProfileForPrincipal(principalId: string) {
  const db = requireRiskSupabase();
  const id = requireUuid(principalId);
  const result = await db
    .from("testnet_tester_profiles")
    .select(
      "id,profile_name,avatar_path,registration_status,access_status,email_verified_at,wallet_verified_at,x_connected_at,discord_connected_at,current_entitlement_grant_id,created_at,updated_at",
    )
    .eq("principal_id", id)
    .maybeSingle();
  if (result.error) throw result.error;
  return result.data;
}
