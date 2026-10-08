import {
  signRiskObject,
  verifyRiskObjectSignature,
} from "./risk-object-signing.server";

import {
  withRiskObjectObservationTimestamp,
} from "./risk-object-observation";
import { assertFedericoPublicationReady } from "./federico-publication-policy";

import {
  buildCountryRiskObject,
  type CountryRiskEventInput,
} from "./country-risk-engine";

import {
  applyCountryRiskCommercialEligibility,
  type StructuredEventCommercialEligibility,
  type StructuredEventCommercialEligibilityStatus,
} from "./country-risk-commercial-eligibility";

import {
  verifyCommercialRiskObjectArtifact,
} from "./commercial-risk-object-policy";

import {
  COUNTRY_RISK_LOOKBACK_HOURS,
  COUNTRY_RISK_METHOD_VERSION,
  GRO_SCHEMA_VERSION,
  type GeomacroRiskObject,
  type RiskDirection,
} from "./risk-object-contract";

import {
  getLatestCompatibleCountryRiskObject,
  getRiskObjectByObjectId,
  persistRiskObject,
} from "./risk-object-store.server";

import {
  requireRiskSupabase,
} from "./risk-supabase.server";

import {
  FEDERICO_STRICT_HIGH_IMPACT_MAX_AGE_HOURS,
  FEDERICO_STRICT_HIGH_IMPACT_SEVERITY,
  FEDERICO_STRICT_MAX_EVIDENCE_AGE_HOURS,
  FEDERICO_STRICT_MIN_INDEPENDENT_SOURCE_FAMILIES,
  FEDERICO_STRICT_MAJOR_SOURCE_IDS,
  FEDERICO_STRICT_AUDITABLE_SOURCE_IDS,
  federicoStrictSourceFamilyForId,
  FEDERICO_STRICT_RELEVANCE_METHOD,
  FEDERICO_STRICT_SOURCE_INDEPENDENCE_METHOD,
  PUBLIC_DEMO_RISK_PROFILE_REASON,
  riskObjectCalculationNamespace,
  withPublicDemoProfileReason,
  type RiskObjectDeliveryProfile,
} from "./public-demo-risk-profile";


export type CountryRiskPublishInput = {
  country_iso3: string;
  country_name?: string | null;

  /**
   * Freeze calculation time for deterministic replay.
   */
  as_of?: string;

  /**
   * Internal delivery profile. Canonical is the default for production/paid
   * surfaces. PUBLIC_DEMO uses only commercially usable derived evidence and
   * is explicitly marked inside the signed artifact.
   */
  delivery_profile?: RiskObjectDeliveryProfile;
};


export type CountryRiskGenerationResult = {
  object: GeomacroRiskObject;

  context: {
    country_iso3: string;

    recent_events_loaded: number;
    country_events_used: number;

    previous_object_id: string | null;
    previous_baseline_status:
      | "AVAILABLE"
      | "NOT_FOUND"
      | "ARCHIVE_CAP_UNAVAILABLE";

    published: boolean;
  };
};


type LoadedStructuredEvents = {
  events: CountryRiskEventInput[];
  commercial_eligibility:
    StructuredEventCommercialEligibility[];
};


function normalizeIso3(
  value: string,
) {
  const iso3 =
    value
      .trim()
      .toUpperCase();

  if (
    !/^[A-Z]{3}$/.test(
      iso3,
    )
  ) {
    throw new Error(
      "country_iso3 must be ISO3",
    );
  }

  return iso3;
}


function normalizeDirection(
  value: unknown,
): RiskDirection {
  switch (value) {
    case "escalating":
    case "cooling":
    case "steady":
    case "unknown":
      return value;

    default:
      return "unknown";
  }
}


function normalizeDomain(
  value: unknown,
): CountryRiskEventInput["domain"] {
  switch (value) {
    case "geopolitics":
    case "macro":
    case "rare_earth":
    case "multi":
      return value;

    default:
      return "multi";
  }
}


function normalizeStringArray(
  value: unknown,
) {
  if (!Array.isArray(value)) {
    return [];
  }

  return [
    ...new Set(
      value
        .map(String)
        .map(
          (item) =>
            item.trim(),
        )
        .filter(Boolean),
    ),
  ];
}


function normalizeCommercialEligibilityStatus(
  value: unknown,
): StructuredEventCommercialEligibilityStatus {
  switch (value) {
    case "VERIFIED":
    case "DERIVED_ONLY":
    case "UNVERIFIED":
    case "INELIGIBLE":
      return value;

    default:
      return "UNVERIFIED";
  }
}


function rowToCountryRiskEvent(
  row: Record<string, unknown>,
): CountryRiskEventInput {
  return {
    id:
      String(
        row.id ?? "",
      ),

    domain:
      normalizeDomain(
        row.domain,
      ),

    event_type:
      row.event_type === null ||
      row.event_type === undefined
        ? null
        : String(
            row.event_type,
          ),

    title:
      String(
        row.title ?? "",
      ),

    primary_country:
      row.primary_country ===
        null ||
      row.primary_country ===
        undefined
        ? null
        : String(
            row.primary_country,
          )
            .trim()
            .toUpperCase(),

    countries:
      normalizeStringArray(
        row.countries,
      ).map(
        (country) =>
          country.toUpperCase(),
      ),

    severity:
      row.severity === null ||
      row.severity === undefined
        ? null
        : Number(
            row.severity,
          ),

    confidence:
      row.confidence === null ||
      row.confidence ===
        undefined
        ? null
        : Number(
            row.confidence,
          ),

    direction:
      normalizeDirection(
        row.direction,
      ),

    first_seen_at:
      String(
        row.first_seen_at ?? "",
      ),

    last_seen_at:
      String(
        row.last_seen_at ?? "",
      ),

    evidence_count:
      Number(
        row.evidence_count ??
          0,
      ),

    independent_source_count:
      Number(
        row
          .independent_source_count ??
          0,
      ),

    evidence_refs:
      row.evidence_refs,

    structure_version:
      String(
        row.structure_version ??
          "",
      ),

    structured_payload:
      row.structured_payload &&
      typeof row.structured_payload ===
        "object"
        ? row.structured_payload as
            Record<
              string,
              unknown
            >
        : null,
  };
}


function rowToCommercialEligibility(
  row: Record<string, unknown>,
): StructuredEventCommercialEligibility {
  return {
    event_id:
      String(
        row.id ?? "",
      ),

    status:
      normalizeCommercialEligibilityStatus(
        row
          .commercial_eligibility_status,
      ),

    reason_codes:
      normalizeStringArray(
        row
          .commercial_eligibility_reason_codes,
      ),
  };
}


// The global sovereign refresh passes one exact as_of to every country. Reuse
// the same immutable read within that single batch instead of paginating the
// 72-hour structured-event window 195+ times. Server requests stay uncached.
let globalRecentEvents: { key: string; promise: Promise<LoadedStructuredEvents> } | null = null;
let canonicalBatchPreviousObjects: {
  key: string;
  byCountry: Map<string, GeomacroRiskObject>;
  preservedCommercialByCountry: Map<string, GeomacroRiskObject>;
  scanned: number;
  preservedScanned: number;
} | null = null;

export function getCanonicalBatchPreservedCommercialRiskObject(
  countryIso3: string,
  asOf: string,
): GeomacroRiskObject | null {
  if (process.env.GEOMACRO_CANONICAL_BATCH !== "1") {
    throw new Error("CANONICAL_BATCH_PRESERVED_GRO_OUTSIDE_BATCH");
  }

  const boundary = new Date(asOf);
  if (Number.isNaN(boundary.getTime())) {
    throw new Error("CANONICAL_BATCH_PRESERVED_GRO_INVALID_AS_OF");
  }

  const key = boundary.toISOString();
  if (canonicalBatchPreviousObjects?.key !== key) {
    throw new Error("CANONICAL_BATCH_PRESERVED_GRO_NOT_PRIMED");
  }

  const iso3 = countryIso3.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(iso3)) {
    throw new Error("CANONICAL_BATCH_PRESERVED_GRO_INVALID_ISO3");
  }

  return canonicalBatchPreviousObjects.preservedCommercialByCountry.get(iso3) ?? null;
}

export async function primeCanonicalBatchPreviousRiskObjects(
  asOf: string,
): Promise<{
  loaded: number;
  scanned: number;
  preservedCommercialLoaded: number;
  preservedCommercialScanned: number;
}> {
  if (process.env.GEOMACRO_CANONICAL_BATCH !== "1") {
    throw new Error("CANONICAL_BATCH_PREVIOUS_PRIME_OUTSIDE_BATCH");
  }

  const boundary = new Date(asOf);
  if (Number.isNaN(boundary.getTime())) {
    throw new Error("CANONICAL_BATCH_PREVIOUS_PRIME_INVALID_AS_OF");
  }
  const key = boundary.toISOString();
  if (canonicalBatchPreviousObjects?.key === key) {
    return {
      loaded: canonicalBatchPreviousObjects.byCountry.size,
      scanned: canonicalBatchPreviousObjects.scanned,
      preservedCommercialLoaded:
        canonicalBatchPreviousObjects.preservedCommercialByCountry.size,
      preservedCommercialScanned:
        canonicalBatchPreviousObjects.preservedScanned,
    };
  }

  const db = requireRiskSupabase();
  const result = await db
    .from("geomacro_risk_objects")
    .select(
      "subject_id,payload,generated_at,commercial_eligibility_reason_codes",
    )
    .eq("subject_type", "country")
    .eq("schema_version", GRO_SCHEMA_VERSION)
    .eq("methodology_version", COUNTRY_RISK_METHOD_VERSION)
    .lt("generated_at", key)
    .not("payload", "is", null)
    .order("generated_at", { ascending: false })
    .limit(1000);

  if (result.error) throw result.error;

  const byCountry = new Map<string, GeomacroRiskObject>();
  for (const row of (result.data ?? []) as Array<Record<string, unknown>>) {
    const iso3 = String(row.subject_id ?? "").trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(iso3) || byCountry.has(iso3)) continue;

    const reasons = normalizeStringArray(row.commercial_eligibility_reason_codes);
    if (reasons.includes(PUBLIC_DEMO_RISK_PROFILE_REASON)) continue;

    const payload = row.payload;
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) continue;
    const object = payload as Partial<GeomacroRiskObject>;
    if (
      object.schema_version !== GRO_SCHEMA_VERSION ||
      object.methodology_version !== COUNTRY_RISK_METHOD_VERSION ||
      object.subject?.type !== "country" ||
      object.subject?.id !== iso3
    ) continue;

    byCountry.set(iso3, payload as GeomacroRiskObject);
  }

  const preservedResult = await db
    .from("geomacro_risk_objects")
    .select(
      "subject_id,payload,generated_at,expires_at,commercial_eligibility_reason_codes",
    )
    .eq("subject_type", "country")
    .eq("schema_version", GRO_SCHEMA_VERSION)
    .eq("methodology_version", COUNTRY_RISK_METHOD_VERSION)
    .eq("verification_status", "VERIFIED")
    .eq("commercial_eligibility_status", "VERIFIED")
    .lt("generated_at", key)
    .gt("expires_at", key)
    .not("payload", "is", null)
    .order("generated_at", { ascending: false })
    .limit(1000);

  if (preservedResult.error) throw preservedResult.error;

  const preservedCommercialByCountry = new Map<string, GeomacroRiskObject>();
  for (const row of (preservedResult.data ?? []) as Array<Record<string, unknown>>) {
    const iso3 = String(row.subject_id ?? "").trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(iso3) || preservedCommercialByCountry.has(iso3)) {
      continue;
    }

    const reasons = normalizeStringArray(row.commercial_eligibility_reason_codes);
    if (reasons.includes(PUBLIC_DEMO_RISK_PROFILE_REASON)) continue;

    const payload = row.payload;
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) continue;
    const object = payload as GeomacroRiskObject;
    if (
      object.schema_version !== GRO_SCHEMA_VERSION ||
      object.methodology_version !== COUNTRY_RISK_METHOD_VERSION ||
      object.subject?.type !== "country" ||
      object.subject?.id !== iso3 ||
      Date.parse(object.expires_at) <= boundary.getTime()
    ) {
      continue;
    }

    if (!verifyRiskObjectSignature(object).valid) continue;
    if (
      !verifyCommercialRiskObjectArtifact(object, { now: boundary }).deliverable
    ) {
      continue;
    }

    preservedCommercialByCountry.set(iso3, object);
  }

  canonicalBatchPreviousObjects = {
    key,
    byCountry,
    preservedCommercialByCountry,
    scanned: (result.data ?? []).length,
    preservedScanned: (preservedResult.data ?? []).length,
  };

  return {
    loaded: byCountry.size,
    scanned: (result.data ?? []).length,
    preservedCommercialLoaded: preservedCommercialByCountry.size,
    preservedCommercialScanned: (preservedResult.data ?? []).length,
  };
}

function loadRecentStructuredEvents(asOf: Date): Promise<LoadedStructuredEvents> {
  if (process.env.GEOMACRO_CANONICAL_BATCH !== "1") return loadRecentStructuredEventsUncached(asOf);
  const key = asOf.toISOString();
  if (globalRecentEvents?.key === key) return globalRecentEvents.promise;
  const promise = loadRecentStructuredEventsUncached(asOf);
  globalRecentEvents = { key, promise };
  promise.catch(() => {
    if (globalRecentEvents?.promise === promise) globalRecentEvents = null;
  });
  return promise;
}

async function loadRecentStructuredEventsUncached(
  asOf: Date,
): Promise<LoadedStructuredEvents> {
  const db =
    requireRiskSupabase();

  const cutoff =
    new Date(
      asOf.getTime() -
        COUNTRY_RISK_LOOKBACK_HOURS *
          3_600_000,
    ).toISOString();

  const pageSize = 1000;
  const rows: Record<string, unknown>[] = [];

  // CANONICAL and PUBLIC_DEMO both enforce the same VERIFIED / DERIVED_ONLY
  // event-id filter below. Push that existing rule into the database query so
  // ineligible rows cannot consume a PostgREST page before admissible rows are
  // considered. Still paginate every admissible row because the eligible set
  // itself can exceed the server response cap.
  for (let from = 0; ; from += pageSize) {
    const result =
      await db
        .from(
          "live_structured_events",
        )
        .select(`
          id,
          domain,
          event_type,
          title,
          primary_country,
          countries,
          severity,
          confidence,
          direction,
          first_seen_at,
          last_seen_at,
          last_observed_at,
          evidence_count,
          independent_source_count,
          evidence_refs,
          structure_version,
          structured_payload,
          commercial_eligibility_status,
          commercial_eligibility_reason_codes
        `)
        .in(
          "commercial_eligibility_status",
          ["VERIFIED", "DERIVED_ONLY"],
        )
        .gte(
          "last_observed_at",
          cutoff,
        )
        .lte(
          "last_observed_at",
          asOf.toISOString(),
        )
        .order(
          "last_observed_at",
          {
            ascending: false,
          },
        )
        .order(
          "id",
          {
            ascending: true,
          },
        )
        .range(
          from,
          from + pageSize - 1,
        );

    if (result.error) {
      throw result.error;
    }

    const page =
      (
        result.data ?? []
      ) as Record<
        string,
        unknown
      >[];

    rows.push(...page);

    if (page.length < pageSize) {
      break;
    }
  }

  return {
    events:
      rows.map(
        row =>
          rowToCountryRiskEvent(
            row,
          ),
      ),

    commercial_eligibility:
      rows.map(
        row =>
          rowToCommercialEligibility(
            row,
          ),
      ),
  };
}


function flashSourceFamily(
  sourceId: string,
  _sourceChannel: string | null,
) {
  return federicoStrictSourceFamilyForId(sourceId);
}

function flashDomain(
  signalCategory: unknown,
): CountryRiskEventInput["domain"] {
  switch (String(signalCategory ?? "").toUpperCase()) {
    case "MACRO":
      return "macro";
    case "CRITICAL_MINERALS":
      return "rare_earth";
    default:
      return "geopolitics";
  }
}

function flashDirection(
  eventType: unknown,
): RiskDirection {
  const value = String(eventType ?? "").toLowerCase();
  if (value.includes("ceasefire") || value.includes("cool")) return "cooling";
  if (
    value.includes("attack") ||
    value.includes("conflict") ||
    value.includes("sanction") ||
    value.includes("military") ||
    value.includes("escalat")
  ) return "escalating";
  return "steady";
}

function federicoStrictPublishedAt(
  value: unknown,
  asOf: Date,
) {
  const raw =
    typeof value === "string"
      ? value.trim()
      : "";

  if (
    !raw ||
    /^\d{4}-\d{2}-\d{2}$/u.test(raw) ||
    !/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/u.test(raw)
  ) {
    return null;
  }

  const publishedMs = Date.parse(raw);
  if (
    !Number.isFinite(publishedMs) ||
    publishedMs > asOf.getTime()
  ) {
    return null;
  }

  return new Date(publishedMs).toISOString();
}

async function loadFedericoStructuredFallback(
  db: ReturnType<typeof requireRiskSupabase>,
  asOf: Date,
  iso3: string,
): Promise<LoadedStructuredEvents> {
  const cutoff = new Date(
    asOf.getTime() -
      FEDERICO_STRICT_MAX_EVIDENCE_AGE_HOURS *
        3_600_000,
  ).toISOString();

  const result = await db
    .from("live_structured_events")
    .select(
      "id,domain,event_type,title,primary_country,countries,severity,confidence,direction,first_seen_at,last_seen_at,last_observed_at,evidence_count,independent_source_count,evidence_refs,structure_version,structured_payload,commercial_eligibility_status,commercial_eligibility_reason_codes,status",
    )
    .in("status", ["active", "monitoring"])
    .gte("last_observed_at", cutoff)
    .lte("last_observed_at", asOf.toISOString())
    .order("last_observed_at", { ascending: false })
    .limit(500);

  if (result.error) throw result.error;

  const fallbackRows = (result.data ?? []) as Array<Record<string, unknown>>;
  const candidateRows = fallbackRows.filter((row) => {
    const primary = String(row.primary_country ?? "").trim().toUpperCase();
    const countries = Array.isArray(row.countries)
      ? row.countries.map((value) => String(value).trim().toUpperCase())
      : [];
    return primary === iso3 || countries.includes(iso3);
  });

  if (!candidateRows.length) {
    return { events: [], commercial_eligibility: [] };
  }

  const eventIds = candidateRows
    .map((row) => String(row.id ?? "").trim())
    .filter(Boolean);

  const evidenceResult = await db
    .from("live_structured_event_evidence")
    .select(
      "event_id,fingerprint,source_domain,source_url,evidence_published_at,country_iso3",
    )
    .in("event_id", eventIds);

  if (evidenceResult.error) throw evidenceResult.error;

  const evidenceByEvent = new Map<string, Array<Record<string, unknown>>>();
  for (const evidence of evidenceResult.data ?? []) {
    const eventId = String(evidence.event_id ?? "").trim();
    if (!eventId) continue;
    const list = evidenceByEvent.get(eventId) ?? [];
    list.push(evidence);
    evidenceByEvent.set(eventId, list);
  }

  const events: CountryRiskEventInput[] = [];
  const commercial_eligibility: StructuredEventCommercialEligibility[] = [];

  for (const row of candidateRows) {
    const eventId = String(row.id ?? "").trim();
    if (!eventId) continue;

    const commercialStatus = normalizeCommercialEligibilityStatus(
      row.commercial_eligibility_status,
    );
    if (commercialStatus !== "VERIFIED" && commercialStatus !== "DERIVED_ONLY") {
      continue;
    }

    const payload =
      row.structured_payload &&
      typeof row.structured_payload === "object"
        ? row.structured_payload as Record<string, unknown>
        : {};

    const validEvidence = (evidenceByEvent.get(eventId) ?? []).filter((item) => {
      const url = String(item.source_url ?? "").trim();
      const published = String(item.evidence_published_at ?? "").trim();
      return /^https?:\/\//i.test(url) && published && !Number.isNaN(Date.parse(published));
    });

    if (!validEvidence.length) continue;

    const sourceDomains = [
      ...new Set(
        validEvidence
          .map((item) => String(item.source_domain ?? "").trim().toLowerCase())
          .filter(Boolean),
      ),
    ];

    const payloadSourceFamilies = Array.isArray(payload.source_families)
      ? payload.source_families.map(String).map((value) => value.trim()).filter(Boolean)
      : [];

    const sourceFamilies = [
      ...new Set(
        (payloadSourceFamilies.length ? payloadSourceFamilies : sourceDomains).filter(Boolean),
      ),
    ];

    const independentSourceCount = sourceFamilies.length;
    if (independentSourceCount < FEDERICO_STRICT_MIN_INDEPENDENT_SOURCE_FAMILIES) continue;

    const evidenceTimes = validEvidence
      .map((item) => Date.parse(String(item.evidence_published_at)))
      .filter(Number.isFinite);

    if (!evidenceTimes.length) continue;

    const latestEvidenceMs = Math.max(...evidenceTimes);
    const ageHours = Math.max(
      0,
      (asOf.getTime() - latestEvidenceMs) / 3_600_000,
    );
    if (
      !Number.isFinite(ageHours) ||
      ageHours > FEDERICO_STRICT_MAX_EVIDENCE_AGE_HOURS
    ) continue;

    const rawSeverity = Math.max(
      0,
      Math.min(100, Number(row.severity ?? 0)),
    );
    const eventType = String(row.event_type ?? "geopolitical_development");
    const isHighImpact =
      rawSeverity >= FEDERICO_STRICT_HIGH_IMPACT_SEVERITY &&
      /conflict|military|attack|escalat/i.test(eventType);

    if (
      isHighImpact &&
      ageHours > FEDERICO_STRICT_HIGH_IMPACT_MAX_AGE_HOURS
    ) continue;

    const primaryCountry = String(row.primary_country ?? "").trim().toUpperCase();
    const countries = Array.isArray(row.countries)
      ? row.countries.map((value) => String(value).trim().toUpperCase()).filter(Boolean)
      : [iso3];

    const sourceUrls = [
      ...new Set(
        validEvidence
          .map((item) => String(item.source_url ?? "").trim())
          .filter((value) => /^https?:\/\//i.test(value)),
      ),
    ];

    const sourceRecordIds = [
      ...new Set(
        validEvidence
          .map((item) => String(item.fingerprint ?? "").trim())
          .filter(Boolean),
      ),
    ];

    const sourceIds = [
      ...new Set(
        [
          ...sourceDomains,
          ...(Array.isArray(payload.source_domains) ? payload.source_domains.map(String) : []),
        ]
          .map((value) => value.trim().toLowerCase())
          .filter(Boolean),
      ),
    ];

    events.push({
      id: `structured_event_${eventId}`,
      domain: normalizeDomain(row.domain),
      event_type: eventType,
      title: String(row.title ?? ""),
      primary_country: primaryCountry || null,
      countries: countries.length ? countries : [iso3],
      severity: rawSeverity,
      confidence: Math.max(0, Math.min(100, Number(row.confidence ?? 0))),
      direction: normalizeDirection(row.direction),
      first_seen_at: String(row.first_seen_at ?? row.last_seen_at ?? asOf.toISOString()),
      last_seen_at: String(row.last_seen_at ?? asOf.toISOString()),
      material_evidence_at: new Date(latestEvidenceMs).toISOString(),
      evidence_count: Math.max(Number(row.evidence_count ?? 0), validEvidence.length),
      independent_source_count: independentSourceCount,
      evidence_refs: sourceUrls,
      structure_version: String(row.structure_version ?? "live-structure-v1.0.0"),
      structured_payload: payload,
      event_family_id: `structured:${eventId}`,
      source_ids: sourceIds,
      source_record_ids: sourceRecordIds,
      source_urls: sourceUrls,
      source_families: sourceFamilies,
      content_hashes: sourceRecordIds,
      relevance_reason:
        primaryCountry === iso3
          ? `Direct primary-country linkage in governed structured intelligence: ${iso3}`
          : `Direct country linkage in governed structured intelligence country set: ${iso3}`,
      transmission_channel: "structured_event_direct_country",
      relevance_weight: 1,
      subject_is_primary: primaryCountry === iso3,
      subject_attribution_confidence: primaryCountry === iso3 ? 100 : 90,
      subject_attribution_method: "structured_event_country_registry",
      corroboration_status: "CONFIRMED",
    });

    commercial_eligibility.push({
      event_id: `structured_event_${eventId}`,
      status: commercialStatus,
      reason_codes: normalizeStringArray(row.commercial_eligibility_reason_codes),
    });
  }

  return { events, commercial_eligibility };
}

async function loadFedericoStrictEvents(
  asOf: Date,
  iso3: string,
): Promise<LoadedStructuredEvents> {
  const db = requireRiskSupabase();
  const cutoff = new Date(
    asOf.getTime() -
      FEDERICO_STRICT_MAX_EVIDENCE_AGE_HOURS *
        3_600_000,
  ).toISOString();

  const familiesResult = await db
    .from("live_flash_event_families")
    .select(
      "family_id,signal_category,canonical_headline,country_isos,first_seen_at,last_seen_at,last_material_update_at,current_status,source_count,independent_source_count,latest_flash_id",
      { count: "exact" },
    )
    .eq("current_status", "ACTIVE")
    .gte("last_seen_at", cutoff)
    .lte("last_seen_at", asOf.toISOString())
    .contains("country_isos", [iso3])
    .order("last_seen_at", { ascending: false })
    .limit(1000);

  if (familiesResult.error) {
    throw familiesResult.error;
  }

  if (familiesResult.count === null || familiesResult.count > 1000 ||
      (familiesResult.data ?? []).length !== familiesResult.count) {
    throw new Error("FEDERICO_STRICT country family query was truncated");
  }

  const families = (familiesResult.data ?? []) as Array<Record<string, unknown>>;

  const flashesResult = await db
    .from("live_flash_events")
    .select(
      "flash_id,source_id,source_record_id,source_channel,published_at,ingested_at,headline,source_url,event_type,signal_category,severity,source_reliability,verification_score,verification_status,first_seen_at,last_seen_at,last_material_update_at,event_family_id,content_hash,material_update,live_flash_event_countries!inner(country_iso3)",
      { count: "exact" },
    )
    .eq("live_flash_event_countries.country_iso3", iso3)
    .eq("verification_status", "VERIFIED")
    .gte("last_seen_at", cutoff)
    .lte("last_seen_at", asOf.toISOString())
    .order("last_seen_at", { ascending: false })
    .limit(1000);

  if (flashesResult.error) {
    throw flashesResult.error;
  }
  if (flashesResult.count === null || flashesResult.count > 1000 ||
      (flashesResult.data ?? []).length !== flashesResult.count) {
    throw new Error("FEDERICO_STRICT country evidence query was truncated");
  }

  const flashRows =
    (flashesResult.data ?? []) as Array<Record<string, unknown>>;

  const flashIds =
    flashRows
      .map((row) => String(row.flash_id ?? ""))
      .filter(Boolean);

  const countryByFlash = new Map<string, Set<string>>();
  const attributionByFlash = new Map<
    string,
    Array<{
      country_iso3: string;
      confidence: number;
      is_primary: boolean;
      attribution_method: string;
    }>
  >();

  for (const id of flashIds) {
    countryByFlash.set(id, new Set<string>());
    attributionByFlash.set(id, []);
  }

  for (let i = 0; i < flashIds.length; i += 250) {
    const countryResult = await db
      .from("live_flash_event_countries")
      .select("flash_id,country_iso3,confidence,is_primary,attribution_method")
      .in("flash_id", flashIds.slice(i, i + 250));

    if (countryResult.error) {
      throw countryResult.error;
    }

    for (const row of countryResult.data ?? []) {
      const set = countryByFlash.get(String(row.flash_id));
      if (set && typeof row.country_iso3 === "string") {
        const countryIso3 =
          row.country_iso3.trim().toUpperCase();

        set.add(countryIso3);

        const attributions =
          attributionByFlash.get(String(row.flash_id));

        if (attributions) {
          attributions.push({
            country_iso3: countryIso3,
            confidence:
              Number(row.confidence ?? 0),
            is_primary:
              Boolean(row.is_primary),
            attribution_method:
              String(row.attribution_method ?? "UNKNOWN"),
          });
        }
      }
    }
  }

  const existingFamiliesById = new Map(
    families.map((row) => [
      String(row.family_id ?? ""),
      row,
    ]),
  );

  const virtualFamilies: Array<Record<string, unknown>> = [];

  for (const flash of flashRows) {
    const flashId = String(flash.flash_id ?? "");
    const eventCountries =
      countryByFlash.get(flashId) ??
      new Set<string>();

    if (!eventCountries.has(iso3)) continue;

    const actualFamilyId =
      String(flash.event_family_id ?? "").trim();

    if (actualFamilyId) {
      continue;
    }

    const publishedAt =
      federicoStrictPublishedAt(
        flash.published_at,
        asOf,
      );

    if (!publishedAt) {
      continue;
    }

    virtualFamilies.push({
      family_id: `flash:${flashId}`,
      signal_category:
        String(flash.signal_category ?? "GEOPOLITICS").toUpperCase(),
      canonical_headline:
        String(flash.headline ?? ""),
      country_isos:
        [...eventCountries].sort(),
      first_seen_at:
        String(flash.first_seen_at ?? flash.ingested_at ?? publishedAt),
      last_seen_at:
        String(flash.last_seen_at ?? flash.ingested_at ?? publishedAt),
      last_material_update_at:
        publishedAt,
      current_status: "ACTIVE",
      source_count: 1,
      independent_source_count: 1,
      latest_flash_id: flashId,
    });
  }

  const combinedFamilies = [
    ...families,
    ...virtualFamilies.filter(
      (row) => !existingFamiliesById.has(String(row.family_id)),
    ),
  ];

  const byFamily = new Map<string, Array<Record<string, unknown>>>();

  for (const flash of flashRows) {
    const actualFamilyId =
      String(flash.event_family_id ?? "").trim();
    const eventCountries =
      countryByFlash.get(String(flash.flash_id ?? "")) ??
      new Set<string>();

    if (!eventCountries.has(iso3)) continue;

    const key =
      actualFamilyId || `flash:${String(flash.flash_id ?? "")}`;

    const list =
      byFamily.get(key) ?? [];

    list.push(flash);
    byFamily.set(key, list);
  }

  const events: CountryRiskEventInput[] = [];
  const commercial_eligibility: StructuredEventCommercialEligibility[] = [];

  for (const family of combinedFamilies) {
    const familyId = String(family.family_id ?? "");
    const members = byFamily.get(familyId) ?? [];
    if (!members.length) continue;

    // Strict partner evidence is country-agnostic. A member is auditable only
    // when it comes from the governed source universe AND that exact source
    // record has receiver-replayable governed attribution to the requested
    // ISO3. This prevents family-level or syndicated fan-out from creating a
    // false country nexus while keeping the same policy for every country.
    const auditableMembers = members.filter((member) => {
      const sourceId = String(member.source_id ?? "").trim().toLowerCase();
      const isAllowedSource = (
        FEDERICO_STRICT_AUDITABLE_SOURCE_IDS as readonly string[]
      ).includes(sourceId);
      const memberAttributions =
        attributionByFlash.get(String(member.flash_id ?? "")) ?? [];
      const hasTargetCountryAttribution = memberAttributions.some(
        (item) => item.country_iso3 === iso3,
      );
      const publishedAt =
        federicoStrictPublishedAt(
          member.published_at,
          asOf,
        );
      return Boolean(
        isAllowedSource &&
        hasTargetCountryAttribution &&
        publishedAt,
      );
    });

    if (!auditableMembers.length) {
      continue;
    }

    // Build one deterministic tuple per governed source. The signed strict
    // contract defines source_ids[i], source_record_ids[i] and
    // content_hashes[i] as the same provenance tuple, so these arrays must
    // never be deduplicated independently.
    const tupleBySourceId = new Map<
      string,
      {
        source_id: string;
        source_record_id: string;
        content_hash: string;
        source_url: string;
        published_at: string;
        member: Record<string, unknown>;
      }
    >();

    const tupleCandidates = auditableMembers
      .map((member) => ({
        source_id: String(member.source_id ?? "").trim().toLowerCase(),
        source_record_id: String(member.source_record_id ?? "").trim(),
        content_hash: String(member.content_hash ?? "").trim().toLowerCase(),
        source_url: String(member.source_url ?? "").trim(),
        published_at:
          federicoStrictPublishedAt(member.published_at, asOf) ?? "",
        member,
      }))
      .filter(
        (item) =>
          Boolean(item.source_id) &&
          Boolean(item.source_record_id) &&
          /^[a-f0-9]{64}$/.test(item.content_hash) &&
          /^https?:\/\//i.test(item.source_url) &&
          Boolean(item.published_at),
      )
      .sort(
        (a, b) =>
          a.source_id.localeCompare(b.source_id) ||
          Date.parse(b.published_at) - Date.parse(a.published_at) ||
          a.source_record_id.localeCompare(b.source_record_id),
      );

    for (const tuple of tupleCandidates) {
      if (!tupleBySourceId.has(tuple.source_id)) {
        tupleBySourceId.set(tuple.source_id, tuple);
      }
    }

    const sourceTuples = [...tupleBySourceId.values()].sort(
      (a, b) => a.source_id.localeCompare(b.source_id),
    );

    const sourceIds = sourceTuples.map((item) => item.source_id);
    const sourceRecordIds = sourceTuples.map((item) => item.source_record_id);
    const contentHashes = sourceTuples.map((item) => item.content_hash);
    const sourceUrls = sourceTuples.map((item) => item.source_url);

    const sourceFamilies = [
      ...new Set(sourceIds.map((sourceId) =>
        flashSourceFamily(sourceId, null),
      )),
    ];

    const independentSourceCount =
      sourceFamilies.length;

    if (
      sourceTuples.length < FEDERICO_STRICT_MIN_INDEPENDENT_SOURCE_FAMILIES ||
      sourceIds.length !== sourceRecordIds.length ||
      sourceIds.length !== contentHashes.length
    ) {
      continue;
    }

    const latestTuple = [...sourceTuples].sort(
      (a, b) =>
        Date.parse(b.published_at) -
          Date.parse(a.published_at) ||
        a.source_id.localeCompare(b.source_id),
    )[0];

    const latestAuditableMember = latestTuple.member;
    const latest = latestAuditableMember;

    const targetAttributions =
      members
        .flatMap(
          (member) =>
            attributionByFlash.get(
              String(member.flash_id ?? ""),
            ) ?? [],
        )
        .filter(
          (item) => item.country_iso3 === iso3,
        )
        .sort(
          (a, b) =>
            Number(b.is_primary) -
              Number(a.is_primary) ||
            b.confidence -
              a.confidence,
        );

    const bestTargetAttribution =
      targetAttributions[0] ?? null;

    const relevanceWeight =
      bestTargetAttribution
        ? Math.max(
            0.75,
            Math.min(
              1,
              (
                bestTargetAttribution.confidence /
                100
              ) *
                (
                  bestTargetAttribution.is_primary
                    ? 1
                    : 0.9
                ),
            ),
          )
        : 0;

    const rawSeverity = Math.max(
      0,
      Math.min(
        100,
        Number(
          latest.severity ?? 0,
        ),
      ),
    );

    const rawConfidence = Math.max(
      0,
      Math.min(
        100,
        Number(
          latest.verification_score != null
            ? Number(latest.verification_score)
            : latest.source_reliability != null
              ? Number(latest.source_reliability)
              : 0,
        ),
      ),
    );

    const eventType = String(
      latest.event_type ?? "geopolitical_development",
    );
    const isHighImpact =
      rawSeverity >= FEDERICO_STRICT_HIGH_IMPACT_SEVERITY &&
      /conflict|military|attack|escalat/i.test(eventType);

    const hasNamedMajorSource =
      sourceIds.some(
        (sourceId) =>
          (FEDERICO_STRICT_MAJOR_SOURCE_IDS as readonly string[]).includes(
            sourceId,
          ),
      );

    let severity = rawSeverity;
    let confidence = rawConfidence;
    let corroborationStatus:
      | "CONFIRMED"
      | "CORROBORATING"
      | "UNCONFIRMED" =
      independentSourceCount >= 2 ||
      hasNamedMajorSource
        ? "CONFIRMED"
        : "CORROBORATING";

    if (isHighImpact && independentSourceCount < FEDERICO_STRICT_MIN_INDEPENDENT_SOURCE_FAMILIES && !hasNamedMajorSource) {
      severity = Math.min(severity, 55);
      confidence = Math.min(confidence, 40);
      corroborationStatus = "UNCONFIRMED";
    }

    const materialEvidenceAt =
      federicoStrictPublishedAt(
        latestAuditableMember.published_at,
        asOf,
      );

    if (!materialEvidenceAt) {
      continue;
    }

    const lastSeen = new Date(materialEvidenceAt);
    const ageHours =
      (asOf.getTime() - lastSeen.getTime()) / 3_600_000;

    if (
      !Number.isFinite(ageHours) ||
      ageHours > FEDERICO_STRICT_MAX_EVIDENCE_AGE_HOURS
    ) {
      continue;
    }

    if (
      isHighImpact &&
      ageHours > FEDERICO_STRICT_HIGH_IMPACT_MAX_AGE_HOURS
    ) {
      continue;
    }

    if (isHighImpact && independentSourceCount < FEDERICO_STRICT_MIN_INDEPENDENT_SOURCE_FAMILIES && !hasNamedMajorSource) {
      continue;
    }

    events.push({
      id: `flash_family_${familyId}`,
      domain: flashDomain(family.signal_category),
      event_type: eventType,
      title: String(latestAuditableMember?.headline ?? family.canonical_headline ?? latest.headline ?? ""),
      primary_country: iso3,
      countries: Array.isArray(family.country_isos)
        ? family.country_isos.map(String)
        : [iso3],
      severity,
      confidence,
      direction: flashDirection(eventType),
      first_seen_at: String(
        family.first_seen_at ??
          latest.first_seen_at ??
          latest.ingested_at,
      ),
      last_seen_at: String(
        family.last_seen_at ??
          latest.last_seen_at ??
          latest.ingested_at,
      ),
      material_evidence_at:
        lastSeen.toISOString(),
      evidence_count: sourceTuples.length,
      independent_source_count: independentSourceCount,
      evidence_refs: sourceUrls.length ? sourceUrls : members.map(
        (member) => String(member.content_hash ?? ""),
      ).filter(Boolean),
      structure_version: "live-flash-family-v1",
      structured_payload: {
        source_families: sourceFamilies,
        source_ids: sourceIds,
        source_record_ids: sourceRecordIds,
        source_urls: sourceUrls,
        content_hashes: contentHashes,
        event_family_id: familyId,
        relevance_reason:
          `Direct ${iso3} linkage via governed source-record country attribution`,
        transmission_channel:
          "direct_country_link",
        relevance_weight: 1,
        corroboration_status: corroborationStatus,
        evidence_freshness_policy:
          "federico-strict-evidence-v1",
        source_independence_method:
          FEDERICO_STRICT_SOURCE_INDEPENDENCE_METHOD,
        relevance_method:
          FEDERICO_STRICT_RELEVANCE_METHOD,
        high_impact_gate:
          isHighImpact
            ? "two_independent_sources_or_named_major_source"
            : "not_required",
        audited_source_headlines: auditableMembers
          .map((member) => ({
            source_id: String(member.source_id ?? "").trim().toLowerCase(),
            headline: String(member.headline ?? "").trim(),
          }))
          .sort((a, b) => a.source_id.localeCompare(b.source_id)),
      },
      event_family_id: familyId,
      source_ids: sourceIds,
      source_record_ids: sourceRecordIds,
      source_urls: sourceUrls,
      source_families: sourceFamilies,
      content_hashes: contentHashes,
      relevance_reason:
        bestTargetAttribution
          ? `${iso3} country attribution: ${bestTargetAttribution.attribution_method}${bestTargetAttribution.is_primary ? " (primary)" : " (related)"}`
          : `Country linkage for ${iso3} was present in the governed flash-country bridge`,
      transmission_channel:
        bestTargetAttribution?.is_primary
          ? "direct_country_link"
          : "linked_country_transmission",
      relevance_weight:
        Number(
          relevanceWeight.toFixed(3),
        ),
      subject_is_primary:
        Boolean(
          bestTargetAttribution?.is_primary,
        ),
      subject_attribution_confidence:
        bestTargetAttribution
          ? bestTargetAttribution.confidence
          : 0,
      subject_attribution_method:
        bestTargetAttribution?.attribution_method ??
        "UNKNOWN",
      corroboration_status: corroborationStatus,
    });

    commercial_eligibility.push({
      event_id: `flash_family_${familyId}`,
      status: "DERIVED_ONLY",
      reason_codes: [
        "verified_live_flash_family",
        "derived_only_delivery_no_raw_redistribution",
      ],
    });
  }

  // Federico strict acceptance must never silently downgrade to a
  // different evidence pipeline. If the governed live-flash path has no
  // auditable evidence, fail closed rather than reintroducing syndicated or
  // issuer-derived provenance through the structured fallback.
  if (events.length === 0) {
    return { events: [], commercial_eligibility: [] };
  }

  return { events, commercial_eligibility };
}

function eventTouchesCountry(
  event: CountryRiskEventInput,
  iso3: string,
) {
  return (
    event.primary_country ===
      iso3 ||
    event.countries.includes(
      iso3,
    )
  );
}


function archiveBaselineTemporarilyUnavailable(
  error: unknown,
) {
  const message =
    error instanceof Error
      ? error.message
      : String(error);

  return (
    message === "B2_DOWNLOAD_CAP_EXCEEDED" ||
    message === "B2_TRANSACTION_CAP_EXCEEDED"
  );
}

async function loadOptionalPreviousBaseline(
  countryIso3: string,
  asOf: string,
  deliveryProfile: RiskObjectDeliveryProfile,
) {
  try {
    const object =
      await getLatestCompatibleCountryRiskObject(
        countryIso3,
        asOf,
        deliveryProfile,
      );

    return {
      object,
      status:
        object
          ? "AVAILABLE"
          : "NOT_FOUND",
    } as const;
  } catch (error) {
    if (!archiveBaselineTemporarilyUnavailable(error)) {
      throw error;
    }

    // The previous compatible GRO is optional and is used only for
    // deterministic delta attribution. Explicit Backblaze account caps must
    // not block publication from fresh current evidence. All other archive
    // failures remain fail-closed.
    console.warn(
      `COUNTRY_GRO_PREVIOUS_BASELINE_ARCHIVE_CAP_UNAVAILABLE ${countryIso3}`,
    );

    return {
      object: null,
      status: "ARCHIVE_CAP_UNAVAILABLE",
    } as const;
  }
}


function previousUsableForPilotDelta(
  previous:
    GeomacroRiskObject |
    null,
) {
  if (!previous) {
    return null;
  }

  /**
   * Pilot continuity may use a previously persisted
   * compatible GRO even when commercial eligibility
   * remains UNVERIFIED.
   *
   * Never use an explicitly UNVERIFIABLE object as
   * the comparison baseline.
   */
  if (
    previous.verification.status ===
      "UNVERIFIABLE"
  ) {
    return null;
  }

  return previous;
}


async function generateInternal(
  input: CountryRiskPublishInput,
  publish: boolean,
): Promise<
  CountryRiskGenerationResult
> {
  const iso3 =
    normalizeIso3(
      input.country_iso3,
    );

  const asOf =
    input.as_of
      ? new Date(
          input.as_of,
        )
      : new Date();

  if (
    Number.isNaN(
      asOf.getTime(),
    )
  ) {
    throw new Error(
      "Invalid as_of timestamp",
    );
  }

  const deliveryProfile =
    input.delivery_profile ??
    "CANONICAL";

  const loaded =
    deliveryProfile === "FEDERICO_STRICT"
      ? await loadFedericoStrictEvents(
          asOf,
          iso3,
        )
      : await loadRecentStructuredEvents(
          asOf,
        );

  const eligibleEventIds =
    deliveryProfile === "PUBLIC_DEMO" ||
    deliveryProfile === "CANONICAL"
      ? new Set(
          loaded
            .commercial_eligibility
            .filter(
              item =>
                item.status ===
                  "VERIFIED" ||
                item.status ===
                  "DERIVED_ONLY",
            )
            .map(
              item =>
                item.event_id,
            ),
        )
      : null;

  const events =
    eligibleEventIds
      ? loaded.events.filter(
          event =>
            eligibleEventIds.has(
              event.id,
            ),
        )
      : loaded.events;

  const commercialEligibility =
    eligibleEventIds
      ? loaded
          .commercial_eligibility
          .filter(
            item =>
              eligibleEventIds.has(
                item.event_id,
              ),
          )
      : loaded
          .commercial_eligibility;

  const countryEvents =
    events.filter(
      (event) =>
        eventTouchesCountry(
          event,
          iso3,
        ),
    );

  const previousBaseline =
    process.env.GEOMACRO_CANONICAL_BATCH === "1" &&
    deliveryProfile === "CANONICAL" &&
    canonicalBatchPreviousObjects?.key === asOf.toISOString()
      ? (() => {
          const object = canonicalBatchPreviousObjects.byCountry.get(iso3) ?? null;
          return {
            object,
            status: object ? "AVAILABLE" : "NOT_FOUND",
          } as const;
        })()
      : await loadOptionalPreviousBaseline(
          iso3,
          asOf.toISOString(),
          deliveryProfile,
        );

  const baseline =
    previousUsableForPilotDelta(
      previousBaseline.object,
    );

  const calculatedObject =
    await buildCountryRiskObject({
      country_iso3:
        iso3,

      country_name:
        input.country_name ??
        null,

      events,

      previous:
        baseline,

      as_of:
        asOf.toISOString(),

      calculation_namespace:
        riskObjectCalculationNamespace(
          deliveryProfile,
        ),
    });

  const eligibilityAppliedObject =
    applyCountryRiskCommercialEligibility(
      calculatedObject,
      commercialEligibility,
    );

  const unsignedObject =
    deliveryProfile ===
      "PUBLIC_DEMO"
      ? {
          ...eligibilityAppliedObject,

          commercial_eligibility: {
            ...eligibilityAppliedObject
              .commercial_eligibility,

            reason_codes:
              withPublicDemoProfileReason(
                eligibilityAppliedObject
                  .commercial_eligibility
                  .reason_codes,
              ),
          },
        }
      : eligibilityAppliedObject;

  const observationBoundObject =
    withRiskObjectObservationTimestamp(
      unsignedObject,
      asOf.toISOString(),
    );

  if (publish && deliveryProfile === "FEDERICO_STRICT") {
    assertFedericoPublicationReady(observationBoundObject);
  }

  const object =
    publish
      ? signRiskObject(
          observationBoundObject,
        )
      : observationBoundObject;

  if (publish) {
    await persistRiskObject(
      object,
    );

    const readBack =
      await getRiskObjectByObjectId(
        object.object_id,
      );

    if (!readBack) {
      throw new Error(
        "Published GRO could not be read back",
      );
    }

    if (
      readBack.integrity
        .calculation_hash !==
      object.integrity
        .calculation_hash
    ) {
      throw new Error(
        "Published GRO read-back calculation hash mismatch",
      );
    }

    const signatureCheck =
      verifyRiskObjectSignature(
        readBack,
      );

    if (!signatureCheck.valid) {
      throw new Error(
        `Published GRO signature verification failed: ${signatureCheck.reason}`,
      );
    }
  }

  return {
    object,

    context: {
      country_iso3:
        iso3,

      recent_events_loaded:
        events.length,

      country_events_used:
        countryEvents.length,

      previous_object_id:
        baseline?.object_id ??
        null,

      previous_baseline_status:
        previousBaseline.status,

      published:
        publish,
    },
  };
}


/**
 * Safe default.
 *
 * Generates the calculation-equivalent unsigned GRO
 * preview, but performs no database write or issuer signing.
 */
export async function
dryRunCountryRiskObject(
  input: CountryRiskPublishInput,
) {
  return await generateInternal(
    input,
    false,
  );
}


/**
 * Explicit immutable publication path.
 *
 * This persists decision context only.
 * It does not execute a transaction, move assets,
 * approve a trade or apply customer policy.
 */
export async function
publishCountryRiskObject(
  input: CountryRiskPublishInput,
) {
  return await generateInternal(
    input,
    true,
  );
}
