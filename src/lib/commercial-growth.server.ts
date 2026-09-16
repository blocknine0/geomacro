import { createHash } from "node:crypto";

import { requireRiskSupabase } from "./risk-supabase.server";

export type CommercialMarketingDraftStatus = "draft" | "approved" | "rejected" | "published";
export type VerifiedMarketingTrigger =
  | "marketplace_listing_verified"
  | "production_endpoint_verified"
  | "manual_verified_milestone";

const SAFE_TRIGGER_KEY = /^[a-z0-9][a-z0-9:._-]{7,179}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PUBLIC_REFERENCE = /^https:\/\/[A-Za-z0-9.-]+(?::[0-9]{1,5})?(?:\/[^\s]*)?$/;

function sha256(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson(object[key])}`)
    .join(",")}}`;
}

function boundedText(value: unknown, field: string, maxLength: number) {
  const normalized = String(value ?? "").trim();
  if (!normalized || normalized.length > maxLength) {
    throw new Error(`${field} is invalid`);
  }
  return normalized;
}

function safeTriggerKey(value: unknown) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!SAFE_TRIGGER_KEY.test(normalized)) {
    throw new Error("trigger_key is invalid");
  }
  return normalized;
}

function safePublicReference(value: unknown) {
  const normalized = String(value ?? "").trim();
  if (!normalized) return null;
  if (normalized.length > 500 || !PUBLIC_REFERENCE.test(normalized)) {
    throw new Error("public_reference must be a bounded HTTPS URL");
  }
  return normalized;
}

export async function loadCommercialMarketingDrafts(input?: {
  status?: CommercialMarketingDraftStatus | "all";
  limit?: number;
}) {
  const db = requireRiskSupabase();
  const limit = Math.max(1, Math.min(200, Math.trunc(input?.limit ?? 100)));
  const status = input?.status ?? "all";

  let query = db
    .from("commercial_marketing_drafts")
    .select(
      "id,created_at,updated_at,trigger_type,trigger_key,status,requires_human_approval,auto_publish_allowed,title,channel_copies,evidence,evidence_sha256,approved_at,approved_by,rejected_at,rejected_by,published_at,publication_reference",
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  if (status !== "all") query = query.eq("status", status);

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function reviewCommercialMarketingDraft(input: {
  id: string;
  action: "approve" | "reject";
  reviewer?: string;
}) {
  const id = String(input.id ?? "").trim();
  if (!UUID.test(id)) throw new Error("draft id is invalid");
  const reviewer = boundedText(input.reviewer ?? "geomacro_owner", "reviewer", 80);
  const now = new Date().toISOString();
  const patch =
    input.action === "approve"
      ? {
          status: "approved",
          approved_at: now,
          approved_by: reviewer,
          rejected_at: null,
          rejected_by: null,
          updated_at: now,
        }
      : {
          status: "rejected",
          rejected_at: now,
          rejected_by: reviewer,
          approved_at: null,
          approved_by: null,
          updated_at: now,
        };

  const db = requireRiskSupabase();
  const { data, error } = await db
    .from("commercial_marketing_drafts")
    .update(patch)
    .eq("id", id)
    .eq("status", "draft")
    .eq("requires_human_approval", true)
    .eq("auto_publish_allowed", false)
    .select(
      "id,status,title,channel_copies,evidence_sha256,approved_at,approved_by,rejected_at,rejected_by",
    )
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("draft is not reviewable");
  return data;
}

export async function enqueueVerifiedCommercialMilestone(input: {
  trigger_type: VerifiedMarketingTrigger;
  trigger_key: string;
  title: string;
  summary: string;
  provider?: string | null;
  public_reference?: string | null;
}) {
  const triggerType = input.trigger_type;
  if (
    triggerType !== "marketplace_listing_verified" &&
    triggerType !== "production_endpoint_verified" &&
    triggerType !== "manual_verified_milestone"
  ) {
    throw new Error("unsupported verified marketing trigger");
  }

  const triggerKey = safeTriggerKey(input.trigger_key);
  const title = boundedText(input.title, "title", 180);
  const summary = boundedText(input.summary, "summary", 700);
  const provider = String(input.provider ?? "").trim().slice(0, 80) || null;
  const publicReference = safePublicReference(input.public_reference);

  const evidence = {
    trigger_type: triggerType,
    trigger_key: triggerKey,
    provider,
    public_reference: publicReference,
    verified_summary: summary,
    generated_at: new Date().toISOString(),
    customer_identity_disclosed: false,
    payer_identity_disclosed: false,
    raw_request_disclosed: false,
    upstream_private_source_identity_disclosed: false,
  };
  const evidenceSha256 = sha256(stableJson(evidence));

  const channelCopies = {
    x: `${title}. ${summary} Publication requires owner approval.`,
    linkedin: `${title}\n\n${summary}\n\nThis is an evidence-backed Geomacro milestone draft. Publication requires owner approval.`,
    discord: `${title}\n${summary}\nDraft only. Owner approval is required before publication.`,
  };

  const db = requireRiskSupabase();
  const { data, error } = await db
    .from("commercial_marketing_drafts")
    .upsert(
      {
        trigger_type: triggerType,
        trigger_key: triggerKey,
        status: "draft",
        requires_human_approval: true,
        auto_publish_allowed: false,
        title,
        channel_copies: channelCopies,
        evidence,
        evidence_sha256: evidenceSha256,
      },
      { onConflict: "trigger_key", ignoreDuplicates: true },
    )
    .select(
      "id,status,trigger_type,trigger_key,title,channel_copies,evidence,evidence_sha256,requires_human_approval,auto_publish_allowed",
    )
    .maybeSingle();
  if (error) throw error;
  return data;
}
