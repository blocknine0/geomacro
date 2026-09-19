import {
  COUNTRY_RISK_HALF_LIFE_HOURS,
  COUNTRY_RISK_LOOKBACK_HOURS,
  COUNTRY_RISK_METHOD_VERSION,
  COUNTRY_RISK_OBJECT_TTL_HOURS,
  GRO_SCHEMA_VERSION,
  riskLabel,
  type GeomacroRiskObject,
  type RiskAttribution,
  type RiskDirection,
  type RiskDriver,
} from "./risk-object-contract";

import {
  FEDERICO_STRICT_HIGH_IMPACT_MAX_AGE_HOURS,
  FEDERICO_STRICT_HIGH_IMPACT_SEVERITY,
  FEDERICO_STRICT_MAX_EVIDENCE_AGE_HOURS,
  FEDERICO_STRICT_RELEVANCE_METHOD,
  FEDERICO_STRICT_SOURCE_FAMILY_MAP_VERSION,
  FEDERICO_STRICT_SOURCE_FAMILY_BY_ID,
  FEDERICO_STRICT_SOURCE_INDEPENDENCE_METHOD,
} from "./public-demo-risk-profile";

export type CountryRiskEventInput = {
  id: string;

  domain:
    | "geopolitics"
    | "macro"
    | "rare_earth"
    | "multi";

  event_type: string | null;
  title: string;

  primary_country: string | null;
  countries: string[];

  severity: number | null;
  confidence: number | null;

  direction: RiskDirection | null;

  first_seen_at: string;
  last_seen_at: string;

  evidence_count: number;
  independent_source_count: number;

  evidence_refs: unknown;

  structure_version: string;

  structured_payload:
    | Record<string, unknown>
    | null;

  event_family_id?: string | null;
  source_ids?: string[];
  source_record_ids?: string[];
  source_urls?: string[];
  source_families?: string[];
  content_hashes?: string[];
  relevance_reason?: string;
  transmission_channel?: string | null;
  relevance_weight?: number;
  subject_is_primary?: boolean;
  subject_attribution_confidence?: number;
  subject_attribution_method?: string;
  material_evidence_at?: string;
  corroboration_status?: "CONFIRMED" | "CORROBORATING" | "UNCONFIRMED";
};

export type BuildCountryRiskInput = {
  country_iso3: string;
  country_name?: string | null;

  events: CountryRiskEventInput[];

  /**
   * Optional previous compatible country GRO.
   * Used only for deterministic delta attribution.
   */
  previous?: GeomacroRiskObject | null;

  /**
   * Deterministic replay support.
   * Defaults to current wall-clock time.
   */
  as_of?: string;

  /**
   * Optional calculation namespace for an explicitly isolated delivery
   * profile. Canonical callers omit this, preserving existing hashes.
   */
  calculation_namespace?: string;
};

type WeightedEvent = {
  event: CountryRiskEventInput;
  driver: RiskDriver;

  age_hours: number;
  time_weight: number;
  confidence_weight: number;
  weight: number;

  severity: number;
  confidence: number;
  relevance_weight: number;
};

function clamp(
  value: number,
  min: number,
  max: number,
) {
  return Math.min(
    max,
    Math.max(min, value),
  );
}

function round(
  value: number,
  digits = 6,
) {
  const factor =
    10 ** digits;

  return (
    Math.round(value * factor) /
    factor
  );
}

function normalizeStringArray(
  value: unknown,
): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return [
    ...new Set(
      value
        .map(String)
        .map((x) => x.trim())
        .filter(Boolean),
    ),
  ].sort();
}

function canonicalize(
  value: unknown,
): unknown {
  if (Array.isArray(value)) {
    return value.map(
      canonicalize,
    );
  }

  if (
    value &&
    typeof value === "object"
  ) {
    return Object.fromEntries(
      Object.entries(
        value as Record<
          string,
          unknown
        >,
      )
        .sort()
        .map(
          ([key, item]) => [
            key,
            canonicalize(item),
          ],
        ),
    );
  }

  return value;
}

async function sha256(
  value: unknown,
) {
  const json =
    JSON.stringify(
      canonicalize(value),
    );

  const digest =
    await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(
        json,
      ),
    );

  return [
    ...new Uint8Array(digest),
  ]
    .map((byte) =>
      byte
        .toString(16)
        .padStart(2, "0"),
    )
    .join("");
}

function driverFor(
  eventType: string | null,
  domain:
    CountryRiskEventInput["domain"],
): RiskDriver {
  const value =
    (eventType ?? "")
      .toLowerCase();

  if (
    value.includes("military") ||
    value.includes("conflict") ||
    value.includes("war") ||
    value.includes("terror")
  ) {
    return "conflict";
  }

  if (
    value.includes("sanction") ||
    value.includes("export_control")
  ) {
    return "sanctions";
  }

  if (
    value.includes(
      "political_instability",
    ) ||
    value.includes("coup") ||
    value.includes("election")
  ) {
    return "political_instability";
  }

  if (
    value.includes("tariff") ||
    value.includes("trade_policy")
  ) {
    return "trade_policy";
  }

  if (
    value.includes(
      "monetary_policy",
    ) ||
    value.includes("interest_rate")
  ) {
    return "monetary_policy";
  }

  if (value.includes("inflation")) {
    return "inflation";
  }

  if (
    value.includes("labor") ||
    value.includes("labour") ||
    value.includes("employment") ||
    value.includes("unemployment")
  ) {
    return "labor_market";
  }

  if (
    value.includes("currency") ||
    value.includes("forex") ||
    value.includes("fx")
  ) {
    return "currency_fx";
  }

  if (
    value.includes("shipping") ||
    value.includes("logistics")
  ) {
    return "shipping_logistics";
  }

  if (
    domain === "rare_earth" ||
    value.includes("rare_earth")
  ) {
    return "rare_earth_supply";
  }

  if (
    value.includes(
      "critical_mineral",
    )
  ) {
    return "critical_minerals";
  }

  if (domain === "macro") {
    return "macro_stress";
  }

  return "other";
}

function directionFromDelta(
  delta: number | null,
): RiskDirection {
  if (delta === null) {
    return "unknown";
  }

  if (delta >= 1) {
    return "escalating";
  }

  if (delta <= -1) {
    return "cooling";
  }

  return "steady";
}

function compatiblePrevious(
  previous:
    GeomacroRiskObject |
    null |
    undefined,
  countryIso3: string,
) {
  return Boolean(
    previous &&
      previous.schema_version ===
        GRO_SCHEMA_VERSION &&
      previous.subject.type ===
        "country" &&
      previous.subject.id ===
        countryIso3 &&
      previous.methodology_version ===
        COUNTRY_RISK_METHOD_VERSION,
  );
}

export async function buildCountryRiskObject(
  input: BuildCountryRiskInput,
): Promise<GeomacroRiskObject> {
  const countryIso3 =
    input.country_iso3
      .trim()
      .toUpperCase();

  if (
    !/^[A-Z]{3}$/.test(
      countryIso3,
    )
  ) {
    throw new Error(
      "country_iso3 must be ISO3",
    );
  }

  const asOf =
    input.as_of
      ? new Date(input.as_of)
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

  const weighted:
    WeightedEvent[] = [];

  for (
    const event of input.events
  ) {
    const countries =
      new Set([
        event.primary_country,
        ...(event.countries ?? []),
      ]);

    if (
      !countries.has(countryIso3)
    ) {
      continue;
    }

    const evidenceTimestamp =
      event.material_evidence_at ??
      event.last_seen_at;

    const seen =
      new Date(
        evidenceTimestamp,
      );

    if (
      Number.isNaN(
        seen.getTime(),
      )
    ) {
      continue;
    }

    const ageHours =
      Math.max(
        0,
        (
          asOf.getTime() -
          seen.getTime()
        ) /
          3_600_000,
      );

    if (
      ageHours >
      COUNTRY_RISK_LOOKBACK_HOURS
    ) {
      continue;
    }

    const severity =
      clamp(
        Number(
          event.severity ?? 0,
        ),
        0,
        100,
      );

    const confidence =
      clamp(
        Number(
          event.confidence ?? 0,
        ),
        0,
        100,
      );

    const timeWeight =
      2 ** (
        -ageHours /
        COUNTRY_RISK_HALF_LIFE_HOURS
      );

    const confidenceWeight =
      confidence / 100;

    const relevanceWeight =
      clamp(
        Number(event.relevance_weight ?? 1),
        0,
        1,
      );

    const weight =
      confidenceWeight *
      timeWeight *
      relevanceWeight;

    if (
      !Number.isFinite(weight) ||
      weight <= 0
    ) {
      continue;
    }

    weighted.push({
      event,
      driver:
        driverFor(
          event.event_type,
          event.domain,
        ),

      age_hours:
        round(ageHours),

      time_weight:
        round(timeWeight),

      confidence_weight:
        round(
          confidenceWeight,
        ),

      weight:
        round(weight),

      severity:
        round(severity),

      confidence:
        round(confidence),
      relevance_weight:
        round(relevanceWeight, 3),
    });
  }

  weighted.sort(
    (a, b) =>
      b.weight - a.weight ||
      b.severity -
        a.severity ||
      a.event.id.localeCompare(
        b.event.id,
      ),
  );

  const totalWeight =
    weighted.reduce(
      (sum, item) =>
        sum + item.weight,
      0,
    );

  const rawScore =
    totalWeight > 0
      ? weighted.reduce(
          (sum, item) =>
            sum +
            item.severity *
              item.weight,
          0,
        ) / totalWeight
      : 0;

  const score =
    round(
      clamp(
        rawScore,
        0,
        100,
      ),
      1,
    );

  const aggregateConfidence =
    totalWeight > 0
      ? weighted.reduce(
          (sum, item) =>
            sum +
            item.confidence *
              item.weight,
          0,
        ) /
        totalWeight /
        100
      : 0;

  const driverMap =
    new Map<
      RiskDriver,
      {
        weightedSeverity: number;
        weight: number;
        eventCount: number;
      }
    >();

  for (
    const item of weighted
  ) {
    const current =
      driverMap.get(
        item.driver,
      ) ?? {
        weightedSeverity: 0,
        weight: 0,
        eventCount: 0,
      };

    current.weight +=
      item.weight;

    current.weightedSeverity +=
      item.severity *
      item.weight;

    current.eventCount += 1;

    driverMap.set(
      item.driver,
      current,
    );
  }

  const previous =
    compatiblePrevious(
      input.previous,
      countryIso3,
    )
      ? input.previous!
      : null;

  const previousContributions =
    new Map<
      RiskDriver,
      number
    >(
      (
        previous?.attribution ??
        []
      ).map(
        (item) => [
          item.driver,
          item.score_contribution,
        ],
      ),
    );

  const currentContributionMap =
    new Map<
      RiskDriver,
      number
    >();

  for (
    const [
      driver,
      stats,
    ] of driverMap.entries()
  ) {
    const contribution =
      totalWeight > 0
        ? stats.weightedSeverity /
          totalWeight
        : 0;

    currentContributionMap.set(
      driver,
      round(
        contribution,
        6,
      ),
    );
  }

  const allDrivers =
    new Set<RiskDriver>([
      ...currentContributionMap.keys(),
      ...previousContributions.keys(),
    ]);

  const attribution:
    RiskAttribution[] = [
      ...allDrivers,
    ]
      .map((driver) => {
        const current =
          currentContributionMap.get(
            driver,
          ) ?? 0;

        const previousValue =
          previous
            ? previousContributions.get(
                driver,
              ) ?? 0
            : null;

        const stats =
          driverMap.get(
            driver,
          );

        return {
          driver,

          score_contribution:
            round(
              current,
              6,
            ),

          delta_contribution:
            previousValue ===
            null
              ? null
              : round(
                  current -
                    previousValue,
                  6,
                ),

          event_count:
            stats?.eventCount ??
            0,

          weight:
            round(
              stats?.weight ??
                0,
              6,
            ),
        };
      })
      .sort(
        (a, b) =>
          Math.abs(
            b.score_contribution,
          ) -
            Math.abs(
              a.score_contribution,
            ) ||
          a.driver.localeCompare(
            b.driver,
          ),
      );

  const previousScore =
    previous
      ? previous.risk.score
      : null;

  const delta =
    previousScore === null
      ? null
      : round(
          score -
            previousScore,
          3,
        );

  const evidence =
    weighted.map(
      ({ event, age_hours }) => ({
        event_id:
          event.id,

        title:
          event.title,

        event_type:
          event.event_type,

        severity:
          round(
            Number(
              event.severity ?? 0,
            ),
            1,
          ),

        confidence:
          round(
            Number(
              event.confidence ??
                0,
            ),
            1,
          ),

        event_family_id:
          event.event_family_id ??
          null,

        source_ids:
          [...(event.source_ids ?? [])],

        source_record_ids:
          [...((event as any).source_record_ids ?? [])],

        source_urls:
          [...(event.source_urls ?? [])],

        source_families:
          [...(event.source_families ?? [])],

        content_hashes:
          [...((event as any).content_hashes ?? [])],

        relevance_reason:
          event.relevance_reason ??
          `Country-link relevance: ${countryIso3}`,

        transmission_channel:
          event.transmission_channel ??
          null,

        relevance_weight:
          round(
            clamp(
              Number(
                event.relevance_weight ?? 1,
              ),
              0,
              1,
            ),
            3,
          ),

        subject_is_primary:
          (event as any).subject_is_primary ??
          true,

        subject_attribution_confidence:
          typeof (event as any).subject_attribution_confidence ===
          "number"
            ? round(
                (event as any).subject_attribution_confidence,
                2,
              )
            : null,

        subject_attribution_method:
          (event as any).subject_attribution_method ??
          null,

        material_evidence_at:
          event.material_evidence_at ??
          event.last_seen_at,

        evidence_age_hours:
          round(age_hours, 2),

        freshness_status:
          age_hours <=
          FEDERICO_STRICT_HIGH_IMPACT_MAX_AGE_HOURS
            ? "FRESH"
            : age_hours <=
                FEDERICO_STRICT_MAX_EVIDENCE_AGE_HOURS
              ? "AGING"
              : "STALE",

        corroboration_status:
          event.corroboration_status ??
          (
            Number(
              event.independent_source_count ?? 0,
            ) >= 2
              ? "CONFIRMED"
              : "UNCONFIRMED"
          ),

        direction:
          event.direction ??
          "unknown",

        last_seen_at:
          event.last_seen_at,

        evidence_count:
          Number(
            event.evidence_count ??
              0,
          ),

        independent_source_count:
          Number(
            event.independent_source_count ??
              0,
          ),

        evidence_refs:
          normalizeStringArray(
            event.evidence_refs,
          ),
      }),
    );

  const structureVersions =
    normalizeStringArray(
      weighted.map(
        (item) =>
          item.event
            .structure_version,
      ),
    );

  const scoringVersions =
    normalizeStringArray(
      weighted.map(
        (item) =>
          item.event
            .structured_payload
            ?.scoring_version,
      ),
    );

  const relevanceVersions =
    normalizeStringArray(
      weighted.map(
        (item) =>
          item.event
            .structured_payload
            ?.relevance_version,
      ),
    );

  const countryVersions =
    normalizeStringArray(
      weighted.map(
        (item) =>
          item.event
            .structured_payload
            ?.country_version,
      ),
    );

  const storyVersions =
    normalizeStringArray(
      weighted.map(
        (item) =>
          item.event
            .structured_payload
            ?.story_version,
      ),
    );

  const evidenceCount =
    evidence.reduce(
      (sum, item) =>
        sum +
        item.evidence_count,
      0,
    );

  const sourceFamilies =
    new Set(
      evidence.flatMap(
        (item) =>
          item.source_families,
      ),
    );

  const calculationInput = {
    methodology_version:
      COUNTRY_RISK_METHOD_VERSION,

    calculation_namespace:
      input.calculation_namespace?.trim() ||
      undefined,

    country_iso3:
      countryIso3,

    as_of:
      asOf.toISOString(),

    lookback_hours:
      COUNTRY_RISK_LOOKBACK_HOURS,

    half_life_hours:
      COUNTRY_RISK_HALF_LIFE_HOURS,

    events:
      weighted.map(
        (item) => ({
          id:
            item.event.id,

          event_type:
            item.event
              .event_type,

          severity:
            item.severity,

          confidence:
            item.confidence,

          last_seen_at:
            item.event
              .last_seen_at,

          driver:
            item.driver,

          weight:
            item.weight,

          relevance_weight:
            item.relevance_weight,

          source_families:
            item.event.source_families ??
            [],

          source_record_ids:
            item.event.source_record_ids ??
            [],

          content_hashes:
            item.event.content_hashes ??
            [],

          event_family_id:
            item.event.event_family_id ??
            null,
        }),
      ),
  };

  const inputHash =
    await sha256(
      calculationInput,
    );

  const dataProjection = {
    country_iso3:
      countryIso3,

    evidence:
      evidence.map(
        (item) => ({
          event_id:
            item.event_id,

          event_family_id:
            item.event_family_id ?? null,

          evidence_refs:
            item.evidence_refs,

          source_ids:
            item.source_ids ?? [],

          source_urls:
            item.source_urls ?? [],

          source_families:
            item.source_families,

          evidence_age_hours:
            item.evidence_age_hours,

          relevance_reason:
            item.relevance_reason,

          material_evidence_at:
            item.material_evidence_at,

          transmission_channel:
            item.transmission_channel,

          relevance_weight:
            item.relevance_weight,

          material_evidence_at:
            item.material_evidence_at ??
            null,

          subject_is_primary:
            item.subject_is_primary ?? true,

          subject_attribution_confidence:
            item.subject_attribution_confidence ?? null,

          subject_attribution_method:
            item.subject_attribution_method ?? null,

          source_record_ids:
            item.source_record_ids ?? [],

          content_hashes:
            item.content_hashes ?? [],
        }),
      ),
  };

  const dataHash =
    await sha256(
      dataProjection,
    );

  const calculationHash =
    await sha256({
      input_hash:
        inputHash,

      score,

      previous_score:
        previousScore,

      delta,

      attribution,
    });

  const generatedAt =
    asOf.toISOString();

  const expiresAt =
    new Date(
      asOf.getTime() +
        COUNTRY_RISK_OBJECT_TTL_HOURS *
          3_600_000,
    ).toISOString();

  const verificationReasons =
    new Set<string>();

  /**
   * Commercial source eligibility has not yet been
   * enforced by a production rights registry.
   * Therefore this pilot object must not claim
   * VERIFIED commercial status.
   */
  verificationReasons.add(
    "commercial_source_eligibility_not_enforced",
  );

  if (
    weighted.length === 0
  ) {
    verificationReasons.add(
      "insufficient_country_evidence",
    );
  }

  if (
    structureVersions.length ===
    0
  ) {
    verificationReasons.add(
      "missing_structure_version",
    );
  }

  const strictProfile =
    input.calculation_namespace ===
    "federico_strict_evidence_v1";

  const totalIndependentSources = new Set(
    evidence.flatMap(
      (item) =>
        item.source_families ??
        [],
    ),
  ).size;

  const highImpactEvidence = evidence.filter(
    (item) =>
      Number(item.severity ?? 0) >=
        FEDERICO_STRICT_HIGH_IMPACT_SEVERITY &&
      /conflict|military|attack|escalat/i.test(
        String(item.event_type ?? ""),
      ),
  );

  const readinessReasons: string[] = [];

  if (strictProfile) {
    if (!evidence.length) {
      readinessReasons.push("no_fresh_evidence");
    }

    if (totalIndependentSources < 2) {
      readinessReasons.push("insufficient_independent_source_families");
    }

    if (
      highImpactEvidence.some(
        (item) =>
          item.corroboration_status !==
            "CONFIRMED" ||
          Number(item.evidence_age_hours ?? 999) >
            FEDERICO_STRICT_HIGH_IMPACT_MAX_AGE_HOURS,
      )
    ) {
      readinessReasons.push("high_impact_evidence_gate_failed");
    }
  }

  const decisionReadiness = {
    status:
      !strictProfile ||
      readinessReasons.length === 0
        ? "READY"
        : evidence.length > 0
          ? "DEGRADED"
          : "UNREADY",
    policy_version:
      "federico-strict-evidence-v1",
    reason_codes:
      readinessReasons.sort(),
    evaluated_at:
      asOf.toISOString(),
  } as const;

  const aggregateConfidenceRounded =
    round(
      clamp(
        aggregateConfidence,
        0,
        1,
      ),
      4,
    );

  const uncertaintyMargin =
    round(
      clamp(
        12 -
          aggregateConfidenceRounded * 6 +
          (strictProfile &&
          evidence.some(
            (item) =>
              item.freshness_status ===
              "AGING",
          )
            ? 2
            : 0),
        5,
        20,
      ),
      1,
    );

  const uncertaintyInterval = {
    low:
      round(
        clamp(
          score - uncertaintyMargin,
          0,
          100,
        ),
        1,
      ),
    high:
      round(
        clamp(
          score + uncertaintyMargin,
          0,
          100,
        ),
        1,
      ),
    method:
      "confidence_freshness_policy_v1" as const,
    calibrated:
      false as const,
  };

  const scoreBandStart =
    Math.floor(score / 5) * 5;
  const scoreBandEnd =
    Math.min(
      100,
      scoreBandStart + 4.9,
    );

  const reproducibility = {
    manifest_version:
      "risk-object-repro-v1",
    calculation_namespace:
      input.calculation_namespace?.trim() ||
      null,
    selection_policy: {
      max_evidence_age_hours:
        strictProfile
          ? FEDERICO_STRICT_MAX_EVIDENCE_AGE_HOURS
          : COUNTRY_RISK_LOOKBACK_HOURS,
      high_impact_max_evidence_age_hours:
        strictProfile
          ? FEDERICO_STRICT_HIGH_IMPACT_MAX_AGE_HOURS
          : COUNTRY_RISK_LOOKBACK_HOURS,
      high_impact_severity_threshold:
        FEDERICO_STRICT_HIGH_IMPACT_SEVERITY,
      minimum_high_impact_independent_sources:
        strictProfile ? 2 : 1,

      source_independence_method:
        strictProfile
          ? FEDERICO_STRICT_SOURCE_INDEPENDENCE_METHOD
          : "canonical_source_family_v1",

      relevance_method:
        strictProfile
          ? FEDERICO_STRICT_RELEVANCE_METHOD
          : "country_registry_match_v1",

      source_family_map_version:
        strictProfile
          ? FEDERICO_STRICT_SOURCE_FAMILY_MAP_VERSION
          : "not_applicable",

      source_family_map:
        strictProfile
          ? { ...FEDERICO_STRICT_SOURCE_FAMILY_BY_ID }
          : {},
    },
    calculation_input:
      calculationInput,
    score_components: {
      total_weight:
        round(totalWeight, 6),
      raw_score:
        round(rawScore, 6),
      rounded_score:
        score,
      aggregate_confidence:
        aggregateConfidenceRounded,
    },
    hash_inputs: {
      data_projection:
        dataProjection,
    },
  };

  const objectId =
    `gro_country_${countryIso3}_${calculationHash.slice(
      0,
      24,
    )}`;

  return {
    schema_version:
      GRO_SCHEMA_VERSION,

    object_id:
      objectId,

    subject: {
      type:
        "country",

      id:
        countryIso3,

      name:
        input.country_name ??
        null,
    },

    risk: {
      score,
      label:
        riskLabel(score),

      score_band:
        `${scoreBandStart.toFixed(0)}-${scoreBandEnd.toFixed(1)}`,

      uncertainty_interval:
        uncertaintyInterval,

      previous_score:
        previousScore,

      delta,

      direction:
        directionFromDelta(
          delta,
        ),
    },

    attribution,

    confidence:
      round(
        clamp(
          aggregateConfidence,
          0,
          1,
        ),
        6,
      ),

    evidence,

    evidence_coverage:
      null,

    evidence_summary: {
      event_count:
        evidence.length,

      evidence_count:
        evidenceCount,

      independent_source_count:
        sourceFamilies.size,
    },

    decision_readiness:
      decisionReadiness,

    methodology_version:
      COUNTRY_RISK_METHOD_VERSION,

    generated_at:
      generatedAt,

    expires_at:
      expiresAt,

    issuer:
      "Geomacro",

    commercial_eligibility: {
      status:
        "UNVERIFIED",

      reason_codes: [
        "commercial_source_eligibility_not_enforced",
      ],
    },

    verification: {
      status:
        "INCOMPLETE",

      reason_codes: [
        ...verificationReasons,
      ].sort(),

      last_verified_at:
        null,
    },

    integrity: {
      input_hash:
        inputHash,

      data_hash:
        dataHash,

      calculation_hash:
        calculationHash,

      payload_hash:
        null,

      canonicalization:
        null,

      signature:
        null,

      signature_scheme:
        null,

      signing_key_id:
        null,

    },

    provenance: {
      structure_versions:
        structureVersions,

      scoring_versions:
        scoringVersions,

      relevance_versions:
        relevanceVersions,

      country_versions:
        countryVersions,

      story_versions:
        storyVersions,

      reproducibility:
        reproducibility,
    },
  };
}
