import { getAppSupabase } from "./supabase-app.server";
import { loadPublishedGri } from "./ask-intelligence.server";
import { normalizeEventStage, type EventStage } from "./event-stage";
import type { AgentCapability } from "./agent/agent-api-contract";

export type AgentEventIntelligence = {
  apiCapability: AgentCapability;
  event: {
    id: string;
    title: string | null;
    category: string | null;
    summary: string | null;
    narrative: string | null;
    stage: EventStage | null;
    createdAt: string | null;
    publishedAt: string | null;
    resolutionAt: string | null;
  };
  risk: {
    severity: number | null;
    confidence: number | null;
    delta: number | null;
  };
  source: {
    name: string | null;
    domain: string | null;
    url: string | null;
    title: string | null;
  };
  classification: {
    provider: string | null;
    model: string | null;
    version: string | null;
    promptVersion: string | null;
    inputHash: string | null;
  };
  gri: {
    displayScore: number | null;
    eventCount: number | null;
    independentStoryCount: number | null;
    coverage: number | null;
    methodologyVersion: string | null;
    proofVersion: string | null;
    verificationStatus: string | null;
    asOf: string | null;
    snapshotId: string | null;
    proofHash: string | null;
    evidenceHash: string | null;
    calculationHash: string | null;
    inputHash: string | null;
    methodologyHash: string | null;
  };
};

type EventRow = {
  id: string;
  source_title?: string | null;
  source_url?: string | null;
  source_name?: string | null;
  source_domain?: string | null;
  category?: string | null;
  summary?: string | null;
  narrative?: string | null;
  stage?: unknown;
  severity?: number | null;
  confidence?: number | null;
  delta?: number | null;
  published_at?: string | null;
  created_at?: string | null;
  resolution_at?: string | null;
  classification_provider?: string | null;
  classification_model?: string | null;
  classification_version?: string | null;
  classification_prompt_version?: string | null;
  classification_input_hash?: string | null;
};

const FULL_COLUMNS =
  "id,source_title,source_url,source_name,source_domain,category,summary,narrative,stage,severity,confidence,delta,published_at,created_at,resolution_at,classification_provider,classification_model,classification_version,classification_prompt_version,classification_input_hash";
const BASE_COLUMNS =
  "id,source_title,source_url,source_name,category,summary,narrative,stage,severity,confidence,delta,published_at,created_at,resolution_at";

function nullableString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function nullableNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

async function loadEvent(eventId: string): Promise<EventRow | null> {
  const supabase = getAppSupabase();
  if (!supabase) throw new Error("Intelligence store unavailable");

  const full = await supabase.from("events").select(FULL_COLUMNS).eq("id", eventId).maybeSingle();
  if (!full.error) return (full.data as EventRow | null) ?? null;

  // Keep older stored intelligence deployments usable when optional metadata
  // columns have not been added yet. Missing fields remain null in the DTO.
  const base = await supabase.from("events").select(BASE_COLUMNS).eq("id", eventId).maybeSingle();
  if (base.error) {
    console.error("[agent-intelligence] event read failed", base.error.message);
    throw new Error("Intelligence store unavailable");
  }
  return (base.data as EventRow | null) ?? null;
}

/** Canonical event intelligence read model. No inference or private GRI fallback. */
export async function getEventIntelligence(
  eventId: string,
): Promise<AgentEventIntelligence | null> {
  const row = await loadEvent(eventId);
  if (!row) return null;
  const gri = await loadPublishedGri();

  return {
    apiCapability: "event.intelligence.v1",
    event: {
      id: row.id,
      title: nullableString(row.source_title),
      category: nullableString(row.category),
      summary: nullableString(row.summary),
      narrative: nullableString(row.narrative),
      stage: row.stage == null ? null : normalizeEventStage(row.stage),
      createdAt: nullableString(row.created_at),
      publishedAt: nullableString(row.published_at),
      resolutionAt: nullableString(row.resolution_at),
    },
    risk: {
      severity: nullableNumber(row.severity),
      confidence: nullableNumber(row.confidence),
      delta: nullableNumber(row.delta),
    },
    source: {
      name: nullableString(row.source_name),
      domain: nullableString(row.source_domain),
      url: nullableString(row.source_url),
      title: nullableString(row.source_title),
    },
    classification: {
      provider: nullableString(row.classification_provider),
      model: nullableString(row.classification_model),
      version: nullableString(row.classification_version),
      promptVersion: nullableString(row.classification_prompt_version),
      inputHash: nullableString(row.classification_input_hash),
    },
    gri: {
      displayScore: nullableNumber(gri.displayScore),
      eventCount: gri.auditPersisted ? nullableNumber(gri.eventCount) : null,
      independentStoryCount: gri.auditPersisted ? nullableNumber(gri.independentStoryCount) : null,
      coverage: gri.auditPersisted ? nullableNumber(gri.coverage) : null,
      methodologyVersion: gri.auditPersisted ? nullableString(gri.methodologyVersion) : null,
      proofVersion: gri.auditPersisted ? nullableString(gri.proofVersion) : null,
      verificationStatus: gri.auditPersisted ? nullableString(gri.verificationStatus) : null,
      asOf: gri.auditPersisted ? nullableString(gri.asOf) : null,
      snapshotId: gri.auditPersisted ? nullableString(gri.snapshotId) : null,
      proofHash: gri.auditPersisted ? nullableString(gri.proofHash) : null,
      evidenceHash: gri.auditPersisted ? nullableString(gri.evidenceHash) : null,
      calculationHash: gri.auditPersisted ? nullableString(gri.calculationHash) : null,
      inputHash: gri.auditPersisted ? nullableString(gri.inputHash) : null,
      methodologyHash: gri.auditPersisted ? nullableString(gri.methodologyHash) : null,
    },
  };
}
