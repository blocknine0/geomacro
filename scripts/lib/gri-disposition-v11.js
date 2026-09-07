import { canonicalJson } from "./gri-engine-v11.js";
import {
  roundNumber,
  sha256,
} from "./gri-proof-v11.js";

export const GRI_DISPOSITION_VERSION = "gri-disposition-v1.0.0";

export const GRI_DISPOSITION = Object.freeze({
  INCLUDED: "included",
  EXCLUDED_NONCANONICAL_CLASSIFICATION:
    "excluded_noncanonical_classification",
});

function text(value) {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

function isoOrNull(value) {
  const ms = Date.parse(String(value ?? ""));
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

export function buildSourceDisposition({
  event,
  disposition,
  classificationSource = null,
  contribution = null,
}) {
  if (!event?.id) {
    throw new Error("GRI disposition requires event.id");
  }

  if (!Object.values(GRI_DISPOSITION).includes(disposition)) {
    throw new Error(`Unknown GRI disposition: ${disposition}`);
  }

  if (
    disposition === GRI_DISPOSITION.INCLUDED &&
    (!contribution || contribution.eventId !== event.id)
  ) {
    throw new Error(
      `Included GRI disposition ${event.id} requires matching contribution`,
    );
  }

  if (
    disposition !== GRI_DISPOSITION.INCLUDED &&
    contribution !== null
  ) {
    throw new Error(
      `Excluded GRI disposition ${event.id} cannot carry contribution`,
    );
  }

  return {
    dispositionVersion: GRI_DISPOSITION_VERSION,
    eventId: String(event.id),

    disposition,
    classificationSource:
      classificationSource === "direct" ||
      classificationSource === "reassessment"
        ? classificationSource
        : null,

    category: text(event.category),

    sourceName: text(event.source_name),
    sourceDomain: text(event.source_domain),
    sourceUrl: text(event.source_url),
    sourceTitle: text(event.source_title),
    summary: text(event.summary),

    observedAt: isoOrNull(event.created_at),
    publishedAt: isoOrNull(event.published_at),

    classificationProvider: text(event.classification_provider),
    classificationModel: text(event.classification_model),
    classificationVersion: text(event.classification_version),
    classificationPromptVersion: text(
      event.classification_prompt_version,
    ),
    classificationScoredAt: isoOrNull(
      event.classification_scored_at,
    ),
    classificationInputHash: text(
      event.classification_input_hash,
    ),

    storyClusterId:
      disposition === GRI_DISPOSITION.INCLUDED
        ? contribution.storyClusterId
        : null,

    rawWeight:
      disposition === GRI_DISPOSITION.INCLUDED
        ? contribution.rawWeight
        : null,

    sourceEffectiveWeight:
      disposition === GRI_DISPOSITION.INCLUDED
        ? contribution.sourceEffectiveWeight
        : null,

    preStoryEventWeight:
      disposition === GRI_DISPOSITION.INCLUDED
        ? contribution.preStoryEventWeight
        : null,

    storyEffectiveWeight:
      disposition === GRI_DISPOSITION.INCLUDED
        ? contribution.storyEffectiveWeight
        : null,

    effectiveEventWeight:
      disposition === GRI_DISPOSITION.INCLUDED
        ? contribution.effectiveEventWeight
        : null,

    contributionPoints:
      disposition === GRI_DISPOSITION.INCLUDED
        ? contribution.contributionPoints
        : null,
  };
}

export function canonicalDispositionRow(row) {
  return {
    dispositionVersion: row.dispositionVersion,
    eventId: row.eventId,
    disposition: row.disposition,
    classificationSource: row.classificationSource,

    category: row.category,

    sourceName: row.sourceName,
    sourceDomain: row.sourceDomain,
    sourceUrl: row.sourceUrl,
    sourceTitle: row.sourceTitle,
    summary: row.summary,

    observedAt: row.observedAt,
    publishedAt: row.publishedAt,

    classificationProvider: row.classificationProvider,
    classificationModel: row.classificationModel,
    classificationVersion: row.classificationVersion,
    classificationPromptVersion:
      row.classificationPromptVersion,
    classificationScoredAt:
      row.classificationScoredAt,
    classificationInputHash:
      row.classificationInputHash,

    storyClusterId: row.storyClusterId,

    rawWeight: roundNumber(row.rawWeight, 10),
    sourceEffectiveWeight:
      roundNumber(row.sourceEffectiveWeight, 10),
    preStoryEventWeight:
      roundNumber(row.preStoryEventWeight, 10),
    storyEffectiveWeight:
      roundNumber(row.storyEffectiveWeight, 10),
    effectiveEventWeight:
      roundNumber(row.effectiveEventWeight, 10),
    contributionPoints:
      roundNumber(row.contributionPoints, 8),
  };
}

export function dispositionStorageRowToCanonical(row) {
  return canonicalDispositionRow({
    dispositionVersion: row.disposition_version,
    eventId: String(row.event_id),
    disposition: row.disposition,
    classificationSource:
      row.classification_source ?? null,

    category: row.category ?? null,

    sourceName: row.source_name ?? null,
    sourceDomain: row.source_domain ?? null,
    sourceUrl: row.source_url ?? null,
    sourceTitle: row.source_title ?? null,
    summary: row.summary ?? null,

    observedAt: row.observed_at ?? null,
    publishedAt: row.published_at ?? null,

    classificationProvider:
      row.classification_provider ?? null,
    classificationModel:
      row.classification_model ?? null,
    classificationVersion:
      row.classification_version ?? null,
    classificationPromptVersion:
      row.classification_prompt_version ?? null,
    classificationScoredAt:
      row.classification_scored_at ?? null,
    classificationInputHash:
      row.classification_input_hash ?? null,

    storyClusterId:
      row.story_cluster_id ?? null,

    rawWeight:
      row.raw_weight === null
        ? null
        : Number(row.raw_weight),

    sourceEffectiveWeight:
      row.source_effective_weight === null
        ? null
        : Number(row.source_effective_weight),

    preStoryEventWeight:
      row.pre_story_event_weight === null
        ? null
        : Number(row.pre_story_event_weight),

    storyEffectiveWeight:
      row.story_effective_weight === null
        ? null
        : Number(row.story_effective_weight),

    effectiveEventWeight:
      row.effective_event_weight === null
        ? null
        : Number(row.effective_event_weight),

    contributionPoints:
      row.contribution_points === null
        ? null
        : Number(row.contribution_points),
  });
}

export function dispositionManifest(dispositions) {
  return dispositions
    .map(canonicalDispositionRow)
    .sort((a, b) =>
      a.eventId.localeCompare(b.eventId),
    );
}

export function dispositionHash(dispositions) {
  return sha256(
    canonicalJson(
      dispositionManifest(dispositions),
    ),
  );
}

export function verifyDispositionCoverage({
  candidateEventIds,
  dispositions,
  contributionEventIds,
}) {
  const candidates = [...candidateEventIds]
    .map(String)
    .sort();

  if (new Set(candidates).size !== candidates.length) {
    throw new Error(
      "GRI disposition candidate universe contains duplicate event IDs",
    );
  }

  const rows = dispositionManifest(dispositions);

  if (rows.length !== candidates.length) {
    throw new Error(
      `GRI disposition coverage mismatch: candidates=${candidates.length}, dispositions=${rows.length}`,
    );
  }

  const dispositionIds = rows.map((row) => row.eventId);

  if (
    dispositionIds.some(
      (id, index) => id !== candidates[index],
    )
  ) {
    throw new Error(
      "GRI disposition ledger does not exactly cover candidate universe",
    );
  }

  const included = rows
    .filter(
      (row) =>
        row.disposition === GRI_DISPOSITION.INCLUDED,
    )
    .map((row) => row.eventId)
    .sort();

  const contributions = [...contributionEventIds]
    .map(String)
    .sort();

  if (
    included.length !== contributions.length ||
    included.some(
      (id, index) => id !== contributions[index],
    )
  ) {
    throw new Error(
      "GRI included dispositions do not exactly match contribution ledger",
    );
  }

  return {
    candidateCount: candidates.length,
    includedCount: included.length,
    excludedCount: candidates.length - included.length,
  };
}
