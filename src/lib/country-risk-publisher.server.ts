import {
  signRiskObject,
  verifyRiskObjectSignature,
} from "./risk-object-signing.server";

import {
  withRiskObjectObservationTimestamp,
} from "./risk-object-observation";

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
  COUNTRY_RISK_LOOKBACK_HOURS,
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
  FEDERICO_STRICT_CALCULATION_NAMESPACE,
  FEDERICO_STRICT_HIGH_IMPACT_MAX_AGE_HOURS,
  FEDERICO_STRICT_HIGH_IMPACT_SEVERITY,
  FEDERICO_STRICT_MAX_EVIDENCE_AGE_HOURS,
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


async function loadRecentStructuredEvents(
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
        evidence_count,
        independent_source_count,
        evidence_refs,
        structure_version,
        structured_payload,
        commercial_eligibility_status,
        commercial_eligibility_reason_codes
      `)
      .gte(
        "last_seen_at",
        cutoff,
      )
      .lte(
        "last_seen_at",
        asOf.toISOString(),
      )
      .order(
        "last_seen_at",
        {
          ascending: false,
        },
      );

  if (result.error) {
    throw result.error;
  }

  const rows =
    (
      result.data ?? []
    ) as Record<
      string,
      unknown
    >[];

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
  sourceChannel: string | null,
) {
  if (sourceId === "telegram_mtproto_flash") {
    return `telegram:${String(sourceChannel ?? "unknown").replace(/^@+/, "").trim().toLowerCase()}`;
  }
  return sourceId;
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
      "family_id,signal_category,canonical_headline,country_isos,first_seen_at,last_seen_at,current_status,source_count,independent_source_count,latest_flash_id",
    )
    .eq("current_status", "ACTIVE")
    .gte("last_seen_at", cutoff)
    .contains("country_isos", [iso3])
    .order("last_seen_at", { ascending: false })
    .limit(100);

  if (familiesResult.error) {
    throw familiesResult.error;
  }

  const families = (familiesResult.data ?? []) as Array<Record<string, unknown>>;
  if (!families.length) {
    return { events: [], commercial_eligibility: [] };
  }

  const familyIds = families
    .map((row) => String(row.family_id ?? ""))
    .filter(Boolean);

  const flashesResult = await db
    .from("live_flash_events")
    .select(
      "flash_id,source_id,source_channel,published_at,ingested_at,headline,source_url,event_type,signal_category,source_reliability,source_reliability_bps,verification_score,verification_score_bps,verification_status,first_seen_at,last_seen_at,event_family_id,content_hash,material_update",
    )
    .in("event_family_id", familyIds)
    .eq("verification_status", "VERIFIED")
    .gte("last_seen_at", cutoff)
    .order("last_seen_at", { ascending: false })
    .limit(1000);

  if (flashesResult.error) {
    throw flashesResult.error;
  }

  const byFamily = new Map<string, Array<Record<string, unknown>>>();
  for (const flash of (flashesResult.data ?? []) as Array<Record<string, unknown>>) {
    const familyId = String(flash.event_family_id ?? "");
    if (!familyId) continue;
    const list = byFamily.get(familyId) ?? [];
    list.push(flash);
    byFamily.set(familyId, list);
  }

  const events: CountryRiskEventInput[] = [];
  const commercial_eligibility: StructuredEventCommercialEligibility[] = [];

  for (const family of families) {
    const familyId = String(family.family_id ?? "");
    const members = byFamily.get(familyId) ?? [];
    if (!members.length) continue;

    const latest = members[0];
    const independentSourceCount = Number(family.independent_source_count ?? 0);
    const sourceFamilies = [
      ...new Set(
        members.map((member) =>
          flashSourceFamily(
            String(member.source_id ?? ""),
            member.source_channel == null
              ? null
              : String(member.source_channel),
          ),
        ),
      ),
    ];

    const sourceIds = [
      ...new Set(
        members
          .map((member) => String(member.source_id ?? "").trim())
          .filter(Boolean),
      ),
    ];

    const sourceUrls = [
      ...new Set(
        members
          .map((member) => String(member.source_url ?? "").trim())
          .filter((value) => /^https?:\/\//i.test(value)),
      ),
    ];

    const rawSeverity = Math.max(
      0,
      Math.min(
        100,
        Number(
          latest.severity_bps != null
            ? Number(latest.severity_bps) / 100
            : latest.severity != null
              ? Number(latest.severity)
              : 0,
        ),
      ),
    );

    const rawConfidence = Math.max(
      0,
      Math.min(
        100,
        Number(
          latest.verification_score_bps != null
            ? Number(latest.verification_score_bps) / 100
            : latest.verification_score != null
              ? Number(latest.verification_score)
              : latest.source_reliability_bps != null
                ? Number(latest.source_reliability_bps) / 100
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
      sourceIds.includes("aljazeera_rss");

    let severity = rawSeverity;
    let confidence = rawConfidence;
    let corroborationStatus:
      | "CONFIRMED"
      | "CORROBORATING"
      | "UNCONFIRMED" =
      independentSourceCount >= 2
        ? "CONFIRMED"
        : "CORROBORATING";

    if (isHighImpact && independentSourceCount < 2 && !hasNamedMajorSource) {
      severity = Math.min(severity, 55);
      confidence = Math.min(confidence, 40);
      corroborationStatus = "UNCONFIRMED";
    }

    const lastSeen = new Date(
      String(
        family.last_seen_at ??
          latest.last_seen_at ??
          latest.ingested_at,
      ),
    );
    const ageHours = Math.max(
      0,
      (asOf.getTime() - lastSeen.getTime()) / 3_600_000,
    );

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

    if (isHighImpact && independentSourceCount < 2 && !hasNamedMajorSource) {
      continue;
    }

    events.push({
      id: `flash_family_${familyId}`,
      domain: flashDomain(family.signal_category),
      event_type: eventType,
      title: String(family.canonical_headline ?? latest.headline ?? ""),
      primary_country: iso3,
      countries: Array.isArray(family.country_isos)
        ? family.country_isos.map(String)
        : [iso3],
      severity,
      confidence,
      direction: flashDirection(eventType),
      first_seen_at: String(family.first_seen_at ?? latest.first_seen_at ?? latest.ingested_at),
      last_seen_at: lastSeen.toISOString(),
      evidence_count: members.length,
      independent_source_count: independentSourceCount,
      evidence_refs: sourceUrls.length ? sourceUrls : members.map(
        (member) => String(member.content_hash ?? ""),
      ).filter(Boolean),
      structure_version: "live-flash-family-v1",
      structured_payload: {
        source_families: sourceFamilies,
        source_ids: sourceIds,
        source_urls: sourceUrls,
        event_family_id: familyId,
        relevance_reason:
          `Direct CHN linkage via canonical event-family country mapping: ${iso3}`,
        transmission_channel:
          "direct_country_link",
        relevance_weight: 1,
        corroboration_status: corroborationStatus,
        evidence_freshness_policy:
          "federico-strict-evidence-v1",
        high_impact_gate:
          isHighImpact
            ? "two_independent_sources_or_named_major_source"
            : "not_required",
      },
      event_family_id: familyId,
      source_ids: sourceIds,
      source_urls: sourceUrls,
      source_families: sourceFamilies,
      relevance_reason:
        `Direct CHN linkage via canonical event-family country mapping: ${iso3}`,
      transmission_channel:
        "direct_country_link",
      relevance_weight: 1,
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
    deliveryProfile ===
      "PUBLIC_DEMO"
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

  const previous =
    await getLatestCompatibleCountryRiskObject(
      iso3,
      asOf.toISOString(),
      deliveryProfile,
    );

  const baseline =
    previousUsableForPilotDelta(
      previous,
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
