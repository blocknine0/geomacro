import {
  CORRIDOR_RISK_METHOD_VERSION,
  CORRIDOR_RISK_OBJECT_TTL_HOURS,
  COUNTRY_RISK_METHOD_VERSION,
  GRO_SCHEMA_VERSION,
  riskLabel,
  type CommercialEligibilityStatus,
  type GeomacroRiskObject,
  type RiskAttribution,
  type RiskDirection,
  type RiskVerificationStatus,
} from "./risk-object-contract";


export type BuildCorridorRiskInput = {
  origin_country_iso3: string;
  destination_country_iso3: string;

  origin:
    GeomacroRiskObject;

  destination:
    GeomacroRiskObject;

  previous?:
    GeomacroRiskObject |
    null;

  as_of?: string;
};


function normalizeIso3(
  value: string,
  field: string,
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
      `${field} must be ISO3`,
    );
  }

  return iso3;
}


export function corridorSubjectId(
  originIso3: string,
  destinationIso3: string,
) {
  const origin =
    normalizeIso3(
      originIso3,
      "origin_country_iso3",
    );

  const destination =
    normalizeIso3(
      destinationIso3,
      "destination_country_iso3",
    );

  if (
    origin ===
    destination
  ) {
    throw new Error(
      "Corridor endpoints must be different countries",
    );
  }

  /*
   * Direction is intentional.
   * USA>CHN and CHN>USA remain distinct corridor
   * identities even though the pilot endpoint
   * composition is currently symmetric.
   */
  return `${origin}>${destination}`;
}


function round(
  value: number,
  digits = 6,
) {
  const factor =
    10 ** digits;

  return (
    Math.round(
      value * factor,
    ) / factor
  );
}


function canonicalize(
  value: unknown,
): unknown {
  if (
    Array.isArray(value)
  ) {
    return value.map(
      canonicalize,
    );
  }

  if (
    value &&
    typeof value ===
      "object"
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
    ...new Uint8Array(
      digest,
    ),
  ]
    .map(
      (byte) =>
        byte
          .toString(16)
          .padStart(2, "0"),
    )
    .join("");
}


function requireCountryEndpoint(
  object:
    GeomacroRiskObject,
  iso3:
    string,
  field:
    string,
) {
  if (
    object.schema_version !==
      GRO_SCHEMA_VERSION ||
    object.methodology_version !==
      COUNTRY_RISK_METHOD_VERSION ||
    object.subject.type !==
      "country" ||
    object.subject.id !==
      iso3
  ) {
    throw new Error(
      `${field} is not a compatible signed-country GRO payload`,
    );
  }
}


function directionFromDelta(
  delta:
    number |
    null,
): RiskDirection {
  if (
    delta === null
  ) {
    return "unknown";
  }

  if (
    delta >= 1
  ) {
    return "escalating";
  }

  if (
    delta <= -1
  ) {
    return "cooling";
  }

  return "steady";
}


function verificationRank(
  status:
    RiskVerificationStatus,
) {
  const rank:
    Record<
      RiskVerificationStatus,
      number
    > = {
      VERIFIED: 0,
      INCOMPLETE: 1,
      STALE: 2,
      EXPIRED: 3,
      UNVERIFIABLE: 4,
    };

  return rank[status];
}


function weakestVerification(
  left:
    RiskVerificationStatus,
  right:
    RiskVerificationStatus,
): RiskVerificationStatus {
  return (
    verificationRank(left) >=
    verificationRank(right)
      ? left
      : right
  );
}


function commercialRank(
  status:
    CommercialEligibilityStatus,
) {
  const rank:
    Record<
      CommercialEligibilityStatus,
      number
    > = {
      VERIFIED: 0,
      UNVERIFIED: 1,
      INELIGIBLE: 2,
    };

  return rank[status];
}


function weakestCommercial(
  left:
    CommercialEligibilityStatus,
  right:
    CommercialEligibilityStatus,
): CommercialEligibilityStatus {
  return (
    commercialRank(left) >=
    commercialRank(right)
      ? left
      : right
  );
}


function uniqueSorted(
  values:
    string[],
) {
  return [
    ...new Set(
      values.filter(Boolean),
    ),
  ].sort();
}


function compatiblePrevious(
  previous:
    GeomacroRiskObject |
    null |
    undefined,
  corridorId:
    string,
) {
  return Boolean(
    previous &&
      previous.schema_version ===
        GRO_SCHEMA_VERSION &&
      previous.methodology_version ===
        CORRIDOR_RISK_METHOD_VERSION &&
      previous.subject.type ===
        "corridor" &&
      previous.subject.id ===
        corridorId,
  );
}


export async function
buildCorridorRiskObject(
  input:
    BuildCorridorRiskInput,
): Promise<
  GeomacroRiskObject
> {
  const originIso3 =
    normalizeIso3(
      input.origin_country_iso3,
      "origin_country_iso3",
    );

  const destinationIso3 =
    normalizeIso3(
      input.destination_country_iso3,
      "destination_country_iso3",
    );

  const corridorId =
    corridorSubjectId(
      originIso3,
      destinationIso3,
    );

  requireCountryEndpoint(
    input.origin,
    originIso3,
    "origin",
  );

  requireCountryEndpoint(
    input.destination,
    destinationIso3,
    "destination",
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

  const dominantEndpoint:
    | "origin"
    | "destination" =
      input.origin
        .risk
        .score >=
      input.destination
        .risk
        .score
        ? "origin"
        : "destination";

  const dominant =
    dominantEndpoint ===
      "origin"
      ? input.origin
      : input.destination;

  /*
   * Corridor v0.1 is intentionally conservative:
   * the corridor inherits the higher endpoint risk.
   *
   * We do NOT claim route-specific, maritime,
   * counterparty, sanctions-path or logistics-path
   * modelling in this pilot methodology.
   */
  const score =
    round(
      Math.max(
        input.origin
          .risk
          .score,
        input.destination
          .risk
          .score,
      ),
      3,
    );

  const previous =
    compatiblePrevious(
      input.previous,
      corridorId,
    )
      ? input.previous!
      : null;

  const previousScore =
    previous
      ? previous
          .risk
          .score
      : null;

  const delta =
    previousScore ===
      null
      ? null
      : round(
          score -
            previousScore,
          3,
        );

  const previousContributions =
    new Map(
      (
        previous
          ?.attribution ??
        []
      ).map(
        (item) => [
          item.driver,
          item
            .score_contribution,
        ],
      ),
    );

  const currentByDriver =
    new Map(
      dominant
        .attribution
        .map(
          (item) => [
            item.driver,
            item,
          ],
        ),
    );

  const allDrivers =
    new Set([
      ...currentByDriver.keys(),
      ...previousContributions.keys(),
    ]);

  const attribution:
    RiskAttribution[] =
      [...allDrivers]
        .map(
          (driver) => {
            const current =
              currentByDriver.get(
                driver,
              );

            const currentContribution =
              current
                ?.score_contribution ??
              0;

            const previousContribution =
              previous
                ? previousContributions.get(
                    driver,
                  ) ?? 0
                : null;

            return {
              driver,

              score_contribution:
                round(
                  currentContribution,
                ),

              delta_contribution:
                previousContribution ===
                  null
                  ? null
                  : round(
                      currentContribution -
                        previousContribution,
                    ),

              event_count:
                current
                  ?.event_count ??
                0,

              weight:
                current
                  ?.weight ??
                0,
            };
          },
        )
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

  const evidenceMap =
    new Map<
      string,
      GeomacroRiskObject[
        "evidence"
      ][number]
    >();

  for (
    const evidence of [
      ...input.origin
        .evidence,
      ...input.destination
        .evidence,
    ]
  ) {
    if (
      !evidenceMap.has(
        evidence.event_id,
      )
    ) {
      evidenceMap.set(
        evidence.event_id,
        evidence,
      );
    }
  }

  const evidence =
    [...evidenceMap.values()]
      .sort(
        (a, b) =>
          a.event_id.localeCompare(
            b.event_id,
          ),
      );

  const sourceFamilies =
    uniqueSorted(
      evidence.flatMap(
        (item) =>
          item.source_families,
      ),
    );

  const evidenceCount =
    evidence.reduce(
      (sum, item) =>
        sum +
        Math.max(
          0,
          Number(
            item.evidence_count,
          ),
        ),
      0,
    );

  const independentSourceCount =
    sourceFamilies.length > 0
      ? sourceFamilies.length
      : Math.max(
          input.origin
            .evidence_summary
            .independent_source_count,
          input.destination
            .evidence_summary
            .independent_source_count,
        );

  let verificationStatus =
    weakestVerification(
      input.origin
        .verification
        .status,
      input.destination
        .verification
        .status,
    );

  /*
   * Endpoint verification cannot automatically
   * verify the corridor methodology itself.
   *
   * Until this pilot composition is independently
   * validated, a fully VERIFIED pair is capped at
   * INCOMPLETE rather than being overclaimed.
   */
  if (
    verificationStatus ===
    "VERIFIED"
  ) {
    verificationStatus =
      "INCOMPLETE";
  }

  const originExpiry =
    new Date(
      input.origin
        .expires_at,
    );

  const destinationExpiry =
    new Date(
      input.destination
        .expires_at,
    );

  if (
    (
      !Number.isNaN(
        originExpiry.getTime(),
      ) &&
      asOf.getTime() >=
        originExpiry.getTime()
    ) ||
    (
      !Number.isNaN(
        destinationExpiry.getTime(),
      ) &&
      asOf.getTime() >=
        destinationExpiry.getTime()
    )
  ) {
    verificationStatus =
      "EXPIRED";
  }

  let commercialStatus =
    weakestCommercial(
      input.origin
        .commercial_eligibility
        .status,
      input.destination
        .commercial_eligibility
        .status,
    );

  /*
   * Commercial eligibility of endpoint inputs does
   * not by itself establish commercial verification
   * of this corridor pilot methodology.
   */
  if (
    commercialStatus ===
    "VERIFIED"
  ) {
    commercialStatus =
      "UNVERIFIED";
  }

  const verificationReasons =
    uniqueSorted([
      ...input.origin
        .verification
        .reason_codes,
      ...input.destination
        .verification
        .reason_codes,
      "corridor_endpoint_composition_pilot",
      "corridor_methodology_pilot_not_independently_verified",
    ]);

  const commercialReasons =
    uniqueSorted([
      ...input.origin
        .commercial_eligibility
        .reason_codes,
      ...input.destination
        .commercial_eligibility
        .reason_codes,
      "corridor_endpoint_composition_pilot",
      "corridor_commercial_eligibility_not_independently_verified",
    ]);

  const ttlExpiry =
    new Date(
      asOf.getTime() +
        CORRIDOR_RISK_OBJECT_TTL_HOURS *
          3_600_000,
    );

  const expiryCandidates =
    [
      originExpiry,
      destinationExpiry,
      ttlExpiry,
    ].filter(
      (date) =>
        !Number.isNaN(
          date.getTime(),
        ),
    );

  const expiresAt =
    new Date(
      Math.min(
        ...expiryCandidates.map(
          (date) =>
            date.getTime(),
        ),
      ),
    );

  const confidence =
    round(
      Math.min(
        input.origin
          .confidence,
        input.destination
          .confidence,
      ),
    );

  const inputHash =
    await sha256({
      methodology_version:
        CORRIDOR_RISK_METHOD_VERSION,

      corridor_id:
        corridorId,

      origin: {
        object_id:
          input.origin
            .object_id,

        payload_hash:
          input.origin
            .integrity
            .payload_hash,

        calculation_hash:
          input.origin
            .integrity
            .calculation_hash,
      },

      destination: {
        object_id:
          input.destination
            .object_id,

        payload_hash:
          input.destination
            .integrity
            .payload_hash,

        calculation_hash:
          input.destination
            .integrity
            .calculation_hash,
      },

      as_of:
        asOf.toISOString(),
    });

  const dataHash =
    await sha256({
      evidence:
        evidence.map(
          (item) => ({
            event_id:
              item.event_id,

            evidence_refs:
              item
                .evidence_refs,

            source_families:
              item
                .source_families,
          }),
        ),

      source_calculation_hashes: [
        input.origin
          .integrity
          .calculation_hash,

        input.destination
          .integrity
          .calculation_hash,
      ],
    });

  const calculationHash =
    await sha256({
      methodology_version:
        CORRIDOR_RISK_METHOD_VERSION,

      composition:
        "max_endpoint_score_v1",

      corridor_id:
        corridorId,

      score,
      previous_score:
        previousScore,
      delta,

      dominant_endpoint:
        dominantEndpoint,

      confidence,

      attribution,

      verification_status:
        verificationStatus,

      commercial_status:
        commercialStatus,

      input_hash:
        inputHash,

      data_hash:
        dataHash,
    });

  const object:
    GeomacroRiskObject = {
      schema_version:
        GRO_SCHEMA_VERSION,

      object_id:
        `gro_corridor_${originIso3}_${destinationIso3}_${calculationHash.slice(0, 24)}`,

      subject: {
        type:
          "corridor",

        id:
          corridorId,

        name:
          null,
      },

      risk: {
        score,

        label:
          riskLabel(
            score,
          ),

        previous_score:
          previousScore,

        delta,

        direction:
          directionFromDelta(
            delta,
          ),
      },

      attribution,

      confidence,

      evidence,

      evidence_coverage:
        null,

      evidence_summary: {
        event_count:
          evidence.length,

        evidence_count:
          evidenceCount,

        independent_source_count:
          independentSourceCount,
      },

      methodology_version:
        CORRIDOR_RISK_METHOD_VERSION,

      corridor_context: {
        origin_country_iso3:
          originIso3,

        destination_country_iso3:
          destinationIso3,

        composition:
          "max_endpoint_score_v1",

        dominant_endpoint:
          dominantEndpoint,

        source_risk_object_ids: [
          input.origin
            .object_id,

          input.destination
            .object_id,
        ],

        source_calculation_hashes: [
          input.origin
            .integrity
            .calculation_hash,

          input.destination
            .integrity
            .calculation_hash,
        ],
      },

      generated_at:
        asOf.toISOString(),

      expires_at:
        expiresAt.toISOString(),

      issuer:
        "Geomacro",

      commercial_eligibility: {
        status:
          commercialStatus,

        reason_codes:
          commercialReasons,
      },

      verification: {
        status:
          verificationStatus,

        reason_codes:
          verificationReasons,

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
          uniqueSorted([
            ...input.origin
              .provenance
              .structure_versions,

            ...input.destination
              .provenance
              .structure_versions,
          ]),

        scoring_versions:
          uniqueSorted([
            ...input.origin
              .provenance
              .scoring_versions,

            ...input.destination
              .provenance
              .scoring_versions,
          ]),

        relevance_versions:
          uniqueSorted([
            ...input.origin
              .provenance
              .relevance_versions,

            ...input.destination
              .provenance
              .relevance_versions,
          ]),

        country_versions:
          uniqueSorted([
            ...input.origin
              .provenance
              .country_versions,

            ...input.destination
              .provenance
              .country_versions,
          ]),

        story_versions:
          uniqueSorted([
            ...input.origin
              .provenance
              .story_versions,

            ...input.destination
              .provenance
              .story_versions,
          ]),
      },
    };

  return object;
}
