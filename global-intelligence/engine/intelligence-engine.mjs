import {createHash} from "node:crypto";

import {routeQuestion} from "./router.mjs";
import {verifyObservations} from "./cross-source-verifier.mjs";
import {defaultAdapters} from "./default-adapters.mjs";

const DEFAULT_CACHE_TTL_MS = 5 * 60 * 1000;
const DEFAULT_CACHE_MAX_ENTRIES = 128;
const DEFAULT_PUBLIC_FINDINGS_PER_GROUP = 3;
const runtimeCache = new Map();

function unwrapRows(result) {
  if (Array.isArray(result)) return result;
  if (result && Array.isArray(result.observations)) return result.observations;
  return [];
}

function normalizeQuestion(value) {
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, 1000);
}

function cacheKey(question, countryIso3, categories) {
  return createHash("sha256")
    .update(JSON.stringify({question, countryIso3: countryIso3 || null, categories}))
    .digest("hex");
}

function pruneCache(now, maxEntries) {
  for (const [key, entry] of runtimeCache) {
    if (!entry || entry.expires_at_ms <= now) runtimeCache.delete(key);
  }

  while (runtimeCache.size > maxEntries) {
    const oldestKey = runtimeCache.keys().next().value;
    if (!oldestKey) break;
    runtimeCache.delete(oldestKey);
  }
}

function publicObservation(observation) {
  return {
    category: observation?.category ?? null,
    country_iso3: observation?.country_iso3 ?? observation?.countryIso3 ?? null,
    published_at: observation?.published_at ?? observation?.publishedAt ?? null,
    observed_at: observation?.observed_at ?? observation?.observedAt ?? null,
    title: observation?.title ?? null,
    summary: observation?.summary ?? observation?.title ?? null,
    metric: observation?.metric ?? null,
    value_numeric: observation?.value_numeric ?? observation?.valueNumeric ?? null,
    value_text: observation?.value_text ?? observation?.valueText ?? null,
    unit: observation?.unit ?? null,
    event_type: observation?.event_type ?? observation?.eventType ?? null,
    signal_type: observation?.signal_type ?? observation?.signalType ?? null,
    confidence: typeof observation?.confidence === "number" ? observation.confidence : null
  };
}

function publicVerification(groups, maxFindingsPerGroup) {
  return groups.map(group => ({
    verified: Boolean(group.verified),
    corroborated: Boolean(group.corroborated),
    independent_source_count: Number(group.independent_source_count || 0),
    trusted_independent_source_count: Number(group.trusted_independent_source_count || 0),
    findings: (group.observations || [])
      .slice(0, maxFindingsPerGroup)
      .map(publicObservation)
  }));
}

function cloneCached(value) {
  return JSON.parse(JSON.stringify(value));
}

/**
 * Bounded-cost hybrid intelligence runtime.
 *
 * Storage policy:
 * - permanent: optional caller-supplied compact/read-only intelligence; this runtime never stores raw live results.
 * - ephemeral_live: external raw results exist only for the request lifetime and are discarded after structuring.
 * - short_cache: process-memory-only TTL cache; no Supabase/B2 write and no durable raw-data storage.
 *
 * Public output intentionally hides source names, URLs, domains, source IDs and raw payloads.
 * Verification still happens internally before those fields are stripped.
 */
export async function answerQuestion(
  question,
  {
    countryIso3 = null,
    adapters = null,
    options = {},
    permanentReader = null
  } = {}
) {
  const normalizedQuestion = normalizeQuestion(question);
  if (!normalizedQuestion) throw new Error("question is required");

  const categories = routeQuestion(normalizedQuestion);
  const now = Date.now();
  const cacheTtlMs = Math.max(0, Number(options.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS));
  const cacheMaxEntries = Math.max(1, Number(options.cacheMaxEntries ?? DEFAULT_CACHE_MAX_ENTRIES));
  const maxFindingsPerGroup = Math.max(
    1,
    Math.min(10, Number(options.maxFindingsPerGroup ?? DEFAULT_PUBLIC_FINDINGS_PER_GROUP))
  );
  const key = cacheKey(normalizedQuestion, countryIso3, categories);

  pruneCache(now, cacheMaxEntries);

  if (typeof permanentReader === "function" && options.forceLive !== true) {
    try {
      const permanent = await permanentReader({
        question: normalizedQuestion,
        countryIso3,
        categories
      });

      if (permanent?.sufficient === true && permanent?.data) {
        return {
          schema_version: "intelligence-answer-2.0",
          question: normalizedQuestion,
          country_iso3: countryIso3,
          categories,
          data_mode: "permanent",
          cache_status: "bypassed",
          message: "Geomacro found these factors from its current internal intelligence based on your question.",
          source_identity_exposed: false,
          durable_live_storage_write: false,
          data: permanent.data,
          generated_at: new Date().toISOString()
        };
      }
    } catch (error) {
      // Permanent storage is an optimization, not a single point of failure.
      // Its outage must not prevent the independent live-adapter path.
      console.error("[intelligence-engine] permanent reader unavailable; continuing live", error);
    }
  }

  if (cacheTtlMs > 0 && options.bypassCache !== true) {
    const cached = runtimeCache.get(key);
    if (cached && cached.expires_at_ms > now) {
      const answer = cloneCached(cached.answer);
      answer.data_mode = "short_cache";
      answer.cache_status = "hit";
      answer.served_at = new Date().toISOString();
      return answer;
    }
  }

  const activeAdapters = adapters ?? defaultAdapters(options);
  const observations = [];
  const adapterResults = {};

  for (const category of categories) {
    const adapter = activeAdapters[category];
    if (!adapter) {
      adapterResults[category] = {
        observation_count: 0,
        requested: null,
        unavailable: true
      };
      continue;
    }

    try {
      const result = await adapter({question: normalizedQuestion, countryIso3});
      const rows = unwrapRows(result);
      adapterResults[category] = {
        observation_count: rows.length,
        requested: result?.requested_indicators ?? null,
        unavailable: false
      };
      observations.push(...rows);
    } catch (error) {
      // A single free/public upstream must never turn the whole Ask workspace
      // into a page-level failure. Keep provider details server-side, continue
      // with independent categories, and return insufficient evidence if the
      // remaining adapters cannot support a grounded answer.
      console.error(
        "[intelligence-engine] live adapter unavailable; continuing",
        category,
        error instanceof Error ? error.message : "unknown error"
      );
      adapterResults[category] = {
        observation_count: 0,
        requested: null,
        unavailable: true
      };
    }
  }

  const verified = verifyObservations(observations);
  const publicGroups = publicVerification(verified, maxFindingsPerGroup);
  const verifiedGroupCount = publicGroups.filter(group => group.verified).length;
  const corroboratedGroupCount = publicGroups.filter(group => group.corroborated).length;
  const hasUsableFindings = publicGroups.some(group => (group.findings || []).length > 0);

  const answer = {
    schema_version: "intelligence-answer-2.0",
    question: normalizedQuestion,
    country_iso3: countryIso3,
    categories,
    data_mode: "ephemeral_live",
    cache_status: "miss",
    message: hasUsableFindings
      ? "Geomacro found these factors in real time based on your question."
      : "Geomacro searched in real time based on your question, but did not find enough usable evidence for a structured answer.",
    source_identity_exposed: false,
    durable_live_storage_write: false,
    observation_count: observations.length,
    verified_group_count: verifiedGroupCount,
    corroborated_group_count: corroboratedGroupCount,
    adapter_results: adapterResults,
    findings: publicGroups,
    insufficient_evidence: !hasUsableFindings,
    generated_at: new Date().toISOString()
  };

  // Only the already-sanitized structured answer is cached in process memory.
  // Raw observations, URLs, source identities and payloads are never placed in the cache.
  if (cacheTtlMs > 0) {
    runtimeCache.set(key, {
      expires_at_ms: now + cacheTtlMs,
      answer: cloneCached(answer)
    });
    pruneCache(now, cacheMaxEntries);
  }

  return answer;
}
