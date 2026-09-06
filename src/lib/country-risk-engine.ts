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
        .sort(
          ([a], [b]) =>
            a.localeCompare(b),
        )
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

    const seen =
      new Date(
        event.last_seen_at,
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

    const weight =
      confidenceWeight *
      timeWeight;

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
      3,
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
      ({ event }) => ({
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
            3,
          ),

        confidence:
          round(
            Number(
              event.confidence ??
                0,
            ),
            3,
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
            event
              .independent_source_count ??
              0,
          ),

        evidence_refs:
          normalizeStringArray(
            event.evidence_refs,
          ),

        source_families:
          normalizeStringArray(
            event
              .structured_payload
              ?.source_families,
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
        }),
      ),
  };

  const inputHash =
    await sha256(
      calculationInput,
    );

  const dataHash =
    await sha256({
      country_iso3:
        countryIso3,

      evidence:
        evidence.map(
          (item) => ({
            event_id:
              item.event_id,

            evidence_refs:
              item.evidence_refs,

            source_families:
              item.source_families,
          }),
        ),
    });

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

      signature:
        null,

      signature_scheme:
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
    },
  };
}
