import {
  createHash,
} from "node:crypto";

import type {
  GeomacroRiskObject,
} from "./risk-object-contract";


export const COUNTRY_RISK_V02_EVENT_RELIABILITY_VERSION =
  "country-risk-event-reliability-v0.1.0-pilot" as const;


export type EventReliabilityStatus =
  | "STRONG"
  | "USABLE"
  | "LIMITED"
  | "INSUFFICIENT";


export type EventReliabilityResult = {
  methodology_version:
    typeof COUNTRY_RISK_V02_EVENT_RELIABILITY_VERSION;

  country_iso3:
    string;

  available:
    boolean;

  status:
    EventReliabilityStatus;

  event_count:
    number;

  driver_count:
    number;

  source_family_count:
    number;

  evidence_reference_count:
    number;

  largest_driver_share:
    number | null;

  largest_event_share:
    number | null;

  effective_driver_count:
    number;

  effective_evidence_count:
    number;

  breadth_factor:
    number;

  source_factor:
    number;

  concentration_factor:
    number;

  confidence_factor:
    number;

  reliability_factor:
    number;

  warnings:
    string[];

  calculation_hash:
    string;
};


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


function hashJson(
  value: unknown,
) {
  return createHash(
    "sha256",
  )
    .update(
      JSON.stringify(
        canonicalize(value),
      ),
    )
    .digest("hex");
}


function round(
  value: number,
  places = 6,
) {
  const factor =
    10 ** places;

  return Math.round(
    (value + Number.EPSILON) *
      factor,
  ) /
    factor;
}


function clamp01(
  value: number,
) {
  return Math.min(
    1,
    Math.max(
      0,
      value,
    ),
  );
}


function effectiveCount(
  shares:
    number[],
) {
  if (
    shares.length === 0
  ) {
    return 0;
  }

  const denominator =
    shares.reduce(
      (
        sum,
        share,
      ) =>
        sum +
        share *
          share,
      0,
    );

  if (
    denominator <= 0
  ) {
    return 0;
  }

  return round(
    1 /
      denominator,
  );
}


export function
buildEventReliability(
  object:
    GeomacroRiskObject,
): EventReliabilityResult {
  const eventCount =
    object
      .evidence_summary
      .event_count;


  /*
   * No evidence means unavailable, not zero-risk.
   */
  if (
    eventCount === 0 ||
    object.confidence === 0
  ) {
    const core = {
      methodology_version:
        COUNTRY_RISK_V02_EVENT_RELIABILITY_VERSION,

      country_iso3:
        object.subject.id,

      available:
        false,

      status:
        "INSUFFICIENT" as const,

      event_count:
        eventCount,

      driver_count:
        0,

      source_family_count:
        0,

      evidence_reference_count:
        0,

      largest_driver_share:
        null,

      largest_event_share:
        null,

      effective_driver_count:
        0,

      effective_evidence_count:
        0,

      breadth_factor:
        0,

      source_factor:
        0,

      concentration_factor:
        0,

      confidence_factor:
        0,

      reliability_factor:
        0,

      warnings: [
        "no_usable_event_evidence",
      ],
    };


    return {
      ...core,

      calculation_hash:
        hashJson(
          core,
        ),
    };
  }


  const positiveAttribution =
    object.attribution
      .filter(
        item =>
          item
            .score_contribution >
          0,
      );


  const totalContribution =
    positiveAttribution
      .reduce(
        (
          sum,
          item,
        ) =>
          sum +
          item
            .score_contribution,
        0,
      );


  const driverShares =
    totalContribution > 0
      ? positiveAttribution
          .map(
            item =>
              item
                .score_contribution /
              totalContribution,
          )
      : [];


  const largestDriverShare =
    driverShares.length > 0
      ? Math.max(
          ...driverShares,
        )
      : null;


  /*
   * Evidence-level concentration.
   *
   * Severity * confidence is used only as a
   * concentration proxy. It does not replace the
   * production risk calculation.
   */
  const evidenceWeights =
    object.evidence
      .map(
        item =>
          Math.max(
            0,
            item.severity,
          ) *
          Math.max(
            0,
            item.confidence,
          ),
      );


  const evidenceWeightTotal =
    evidenceWeights.reduce(
      (
        sum,
        value,
      ) =>
        sum +
        value,
      0,
    );


  const evidenceShares =
    evidenceWeightTotal > 0
      ? evidenceWeights
          .map(
            value =>
              value /
              evidenceWeightTotal,
          )
      : [];


  const largestEventShare =
    evidenceShares.length > 0
      ? Math.max(
          ...evidenceShares,
        )
      : null;


  const sourceFamilies =
    new Set<string>();


  const evidenceReferences =
    new Set<string>();


  for (
    const evidence of
      object.evidence
  ) {
    for (
      const family of
        evidence.source_families
    ) {
      sourceFamilies.add(
        family,
      );
    }


    for (
      const reference of
        evidence.evidence_refs
    ) {
      evidenceReferences.add(
        reference,
      );
    }
  }


  const effectiveDriverCount =
    effectiveCount(
      driverShares,
    );


  const effectiveEvidenceCount =
    effectiveCount(
      evidenceShares,
    );


  /*
   * Breadth saturates progressively.
   *
   * 1 event  => 0.25
   * 2 events => 0.50
   * 3 events => 0.75
   * >=4      => 1.00
   */
  const breadthFactor =
    clamp01(
      eventCount /
      4,
    );


  /*
   * Independent source-family breadth.
   * Three families is sufficient for full pilot credit.
   */
  const sourceFactor =
    clamp01(
      sourceFamilies.size /
      3,
    );


  /*
   * Penalize concentration.
   *
   * Full factor when no single driver/event dominates.
   * A 100% single-event or single-driver system receives
   * a substantial penalty, but does not fabricate zero.
   */
  const driverConcentrationFactor =
    largestDriverShare === null
      ? 0
      : clamp01(
          1.25 -
          largestDriverShare,
        );


  const eventConcentrationFactor =
    largestEventShare === null
      ? 0
      : clamp01(
          1.25 -
          largestEventShare,
        );


  const concentrationFactor =
    round(
      (
        driverConcentrationFactor +
        eventConcentrationFactor
      ) /
      2,
    );


  const confidenceFactor =
    clamp01(
      object.confidence,
    );


  /*
   * Reliability is geometric-style in spirit:
   * every dimension matters, but no one factor alone
   * can create full reliability.
   *
   * We use a conservative weighted arithmetic pilot
   * while keeping each constituent exposed.
   */
  const reliabilityFactor =
    round(
      (
        breadthFactor *
          0.30
      ) +
      (
        sourceFactor *
          0.20
      ) +
      (
        concentrationFactor *
          0.25
      ) +
      (
        confidenceFactor *
          0.25
      ),
    );


  const warnings:
    string[] = [];


  if (
    eventCount === 1
  ) {
    warnings.push(
      "single_event_evidence",
    );
  }


  if (
    positiveAttribution.length ===
    1
  ) {
    warnings.push(
      "single_driver_concentration",
    );
  }


  if (
    largestDriverShare !==
      null &&
    largestDriverShare >=
      0.75
  ) {
    warnings.push(
      "dominant_driver_share",
    );
  }


  if (
    largestEventShare !==
      null &&
    largestEventShare >=
      0.75
  ) {
    warnings.push(
      "dominant_event_share",
    );
  }


  if (
    sourceFamilies.size <
    2
  ) {
    warnings.push(
      "limited_source_family_diversity",
    );
  }


  let status:
    EventReliabilityStatus;


  if (
    reliabilityFactor >=
    0.75
  ) {
    status =
      "STRONG";
  }
  else if (
    reliabilityFactor >=
    0.55
  ) {
    status =
      "USABLE";
  }
  else if (
    reliabilityFactor >=
    0.35
  ) {
    status =
      "LIMITED";
  }
  else {
    status =
      "INSUFFICIENT";
  }


  const core = {
    methodology_version:
      COUNTRY_RISK_V02_EVENT_RELIABILITY_VERSION,

    country_iso3:
      object.subject.id,

    available:
      true,

    status,

    event_count:
      eventCount,

    driver_count:
      positiveAttribution.length,

    source_family_count:
      sourceFamilies.size,

    evidence_reference_count:
      evidenceReferences.size,

    largest_driver_share:
      largestDriverShare ===
        null
        ? null
        : round(
            largestDriverShare,
          ),

    largest_event_share:
      largestEventShare ===
        null
        ? null
        : round(
            largestEventShare,
          ),

    effective_driver_count:
      effectiveDriverCount,

    effective_evidence_count:
      effectiveEvidenceCount,

    breadth_factor:
      round(
        breadthFactor,
      ),

    source_factor:
      round(
        sourceFactor,
      ),

    concentration_factor:
      concentrationFactor,

    confidence_factor:
      round(
        confidenceFactor,
      ),

    reliability_factor:
      reliabilityFactor,

    warnings,
  };


  return {
    ...core,

    calculation_hash:
      hashJson(
        core,
      ),
  };
}
