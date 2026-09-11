import { createHash, randomBytes } from "node:crypto";

import { requireRiskSupabase } from "./risk-supabase.server";
import {
  normalizeTestnetSocialCardInput,
  TESTNET_SOCIAL_CARD_VERSION,
  type TestnetSocialCardInput,
} from "./testnet-social-card";

const PLATFORM_VALUES = new Set([
  "x",
  "linkedin",
  "reddit",
  "whatsapp",
  "telegram",
  "copy_link",
  "download_image",
]);

function requireUuid(value: unknown, code: string) {
  const text = String(value ?? "").trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text)) {
    throw new Error(code);
  }
  return text;
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function stablePayload(input: ReturnType<typeof normalizeTestnetSocialCardInput>) {
  return JSON.stringify({
    subject: input.subject,
    summary: input.summary,
    score: input.score,
    delta: input.delta,
    confidence: input.confidence,
    chain: input.chain,
    profile_name: input.profile_name,
    card_version: TESTNET_SOCIAL_CARD_VERSION,
  });
}

function newSlug() {
  return `signal-${randomBytes(12).toString("hex")}`;
}

export async function createTestnetSharePage(input: {
  principalId: string;
  usageEventId: string;
  card: TestnetSocialCardInput;
  displayProfileName?: boolean;
}) {
  const principalId = requireUuid(input.principalId, "INVALID_PRINCIPAL_ID");
  const usageEventId = requireUuid(input.usageEventId, "INVALID_USAGE_EVENT_ID");
  const db = requireRiskSupabase();

  const usage = await db
    .from("commercial_usage_events")
    .select("id,principal_id,environment,access_surface,success,shareable,subject_type,subject_key,risk_object_id")
    .eq("id", usageEventId)
    .eq("principal_id", principalId)
    .maybeSingle();

  if (usage.error) throw new Error("SHARE_USAGE_LOOKUP_FAILED");
  if (!usage.data || usage.data.environment !== "testnet" || usage.data.access_surface !== "testnet_tester") {
    throw new Error("SHARE_USAGE_NOT_OWNED");
  }
  if (!usage.data.success || !usage.data.shareable) throw new Error("SHARE_USAGE_NOT_ELIGIBLE");

  const profile = await db
    .from("testnet_tester_profiles")
    .select("profile_name,registration_status,access_status,suspended_at")
    .eq("principal_id", principalId)
    .maybeSingle();

  if (profile.error) throw new Error("SHARE_PROFILE_LOOKUP_FAILED");
  if (!profile.data || profile.data.registration_status !== "complete" || profile.data.access_status !== "active" || profile.data.suspended_at) {
    throw new Error("TESTER_ACCESS_NOT_ACTIVE");
  }

  const normalized = normalizeTestnetSocialCardInput({
    ...input.card,
    profile_name: input.displayProfileName ? profile.data.profile_name : null,
  });
  const payloadHash = sha256(stablePayload(normalized));
  const shareSlug = newSlug();

  const inserted = await db
    .from("testnet_public_share_pages")
    .insert({
      share_slug: shareSlug,
      principal_id: principalId,
      usage_event_id: usageEventId,
      card_version: TESTNET_SOCIAL_CARD_VERSION,
      payload_sha256: payloadHash,
      subject: normalized.subject,
      summary: normalized.summary,
      risk_score: normalized.score,
      risk_delta: normalized.delta,
      confidence: normalized.confidence,
      chain_label: normalized.chain,
      profile_name: normalized.profile_name,
      risk_object_id: usage.data.risk_object_id ?? null,
    })
    .select("share_slug,created_at")
    .single();

  if (inserted.error || !inserted.data) throw new Error("SHARE_CREATE_FAILED");

  const telemetry = await db.from("commercial_share_events").insert({
    principal_id: principalId,
    usage_event_id: usageEventId,
    environment: "testnet",
    surface: "testnet_tester",
    platform: "copy_link",
    share_slug: shareSlug,
    card_version: TESTNET_SOCIAL_CARD_VERSION,
    card_payload_sha256: payloadHash,
    subject_type: usage.data.subject_type ?? null,
    subject_key: usage.data.subject_key ?? null,
    risk_object_id: usage.data.risk_object_id ?? null,
    profile_name_displayed: Boolean(normalized.profile_name),
    upstream_news_source_identity_exposed: false,
  });

  if (telemetry.error) {
    await db.from("testnet_public_share_pages").delete().eq("share_slug", shareSlug).eq("principal_id", principalId);
    throw new Error("SHARE_TELEMETRY_FAILED");
  }

  return {
    share_slug: shareSlug,
    created_at: inserted.data.created_at,
    card_version: TESTNET_SOCIAL_CARD_VERSION,
    payload_sha256: payloadHash,
  } as const;
}

export async function loadPublicTestnetSharePage(slug: string) {
  const shareSlug = String(slug ?? "").trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{7,95}$/.test(shareSlug)) return null;
  const db = requireRiskSupabase();
  const result = await db
    .from("testnet_public_share_pages")
    .select("share_slug,card_version,payload_sha256,subject,summary,risk_score,risk_delta,confidence,chain_label,profile_name,risk_object_id,created_at,revoked_at")
    .eq("share_slug", shareSlug)
    .maybeSingle();
  if (result.error) throw new Error("SHARE_LOOKUP_FAILED");
  if (!result.data || result.data.revoked_at) return null;
  return result.data;
}

export async function recordTestnetSharePlatform(input: {
  principalId: string;
  shareSlug: string;
  platform: string;
}) {
  const principalId = requireUuid(input.principalId, "INVALID_PRINCIPAL_ID");
  const platform = String(input.platform ?? "").trim().toLowerCase();
  if (!PLATFORM_VALUES.has(platform)) throw new Error("INVALID_SHARE_PLATFORM");
  const db = requireRiskSupabase();

  const page = await db
    .from("testnet_public_share_pages")
    .select("usage_event_id,payload_sha256,card_version,profile_name,risk_object_id")
    .eq("share_slug", input.shareSlug)
    .eq("principal_id", principalId)
    .is("revoked_at", null)
    .maybeSingle();
  if (page.error) throw new Error("SHARE_LOOKUP_FAILED");
  if (!page.data) throw new Error("SHARE_NOT_OWNED");

  const inserted = await db.from("commercial_share_events").insert({
    principal_id: principalId,
    usage_event_id: page.data.usage_event_id,
    environment: "testnet",
    surface: "testnet_tester",
    platform,
    share_slug: input.shareSlug,
    card_version: page.data.card_version,
    card_payload_sha256: page.data.payload_sha256,
    risk_object_id: page.data.risk_object_id ?? null,
    profile_name_displayed: Boolean(page.data.profile_name),
    upstream_news_source_identity_exposed: false,
  });
  if (inserted.error) throw new Error("SHARE_TELEMETRY_FAILED");
  return { ok: true } as const;
}
