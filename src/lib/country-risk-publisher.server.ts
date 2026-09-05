import {
  buildCountryRiskObject,
  type CountryRiskEventInput,
} from "./country-risk-engine";

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


export type CountryRiskPublishInput = {
  country_iso3: string;
  country_name?: string | null;

  /**
   * Freeze calculation time for deterministic replay.
   */
  as_of?: string;
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


async function loadRecentStructuredEvents(
  asOf: Date,
) {
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
        structured_payload
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

  return (
    result.data ?? []
  ).map(
    (row) =>
      rowToCountryRiskEvent(
        row as Record<
          string,
          unknown
        >,
      ),
  );
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

  const events =
    await loadRecentStructuredEvents(
      asOf,
    );

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
    );

  const baseline =
    previousUsableForPilotDelta(
      previous,
    );

  const object =
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
    });

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
 * Generates the exact object that would be published,
 * but performs no GRO database write.
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
