import {
  requireRiskSupabase,
} from "./risk-supabase.server";

import {
  GRO_SCHEMA_VERSION,
  COUNTRY_RISK_METHOD_VERSION,
  type GeomacroRiskObject,
} from "./risk-object-contract";

type RiskObjectRow = {
  object_id: string;
  payload: unknown;
  generated_at: string;
  expires_at: string;
};

function isCompatibleCountryRiskObject(
  value: unknown,
  countryIso3: string,
): value is GeomacroRiskObject {
  if (
    !value ||
    typeof value !== "object"
  ) {
    return false;
  }

  const object =
    value as Partial<GeomacroRiskObject>;

  return Boolean(
    object.schema_version ===
      GRO_SCHEMA_VERSION &&
    object.methodology_version ===
      COUNTRY_RISK_METHOD_VERSION &&
    object.subject?.type ===
      "country" &&
    object.subject?.id ===
      countryIso3,
  );
}

export async function
persistRiskObject(
  object: GeomacroRiskObject,
): Promise<void> {
  const db =
    requireRiskSupabase();

  const row = {
    object_id:
      object.object_id,

    schema_version:
      object.schema_version,

    subject_type:
      object.subject.type,

    subject_id:
      object.subject.id,

    subject_name:
      object.subject.name,

    methodology_version:
      object.methodology_version,

    risk_score:
      object.risk.score,

    risk_label:
      object.risk.label,

    previous_score:
      object.risk.previous_score,

    risk_delta:
      object.risk.delta,

    risk_direction:
      object.risk.direction,

    confidence:
      object.confidence,

    commercial_eligibility_status:
      object
        .commercial_eligibility
        .status,

    commercial_eligibility_reason_codes:
      object
        .commercial_eligibility
        .reason_codes,

    verification_status:
      object.verification.status,

    verification_reason_codes:
      object.verification.reason_codes,

    last_verified_at:
      object
        .verification
        .last_verified_at,

    input_hash:
      object.integrity.input_hash,

    data_hash:
      object.integrity.data_hash,

    calculation_hash:
      object
        .integrity
        .calculation_hash,

    generated_at:
      object.generated_at,

    expires_at:
      object.expires_at,

    payload:
      object,
  };

  const { error } =
    await db
      .from(
        "geomacro_risk_objects",
      )
      .insert(row);

  if (!error) {
    return;
  }

  /*
   * Deterministic replay may attempt to persist the
   * exact same object_id again. Because GRO rows are
   * immutable, do not upsert/update.
   *
   * Verify that the existing immutable object has the
   * same calculation hash. If so, persistence is
   * idempotently complete.
   */

  const existing =
    await db
      .from(
        "geomacro_risk_objects",
      )
      .select(
        "object_id,calculation_hash",
      )
      .eq(
        "object_id",
        object.object_id,
      )
      .maybeSingle();

  if (existing.error) {
    throw existing.error;
  }

  if (
    existing.data &&
    existing.data
      .calculation_hash ===
      object.integrity
        .calculation_hash
  ) {
    return;
  }

  throw error;
}


export async function
getLatestCompatibleCountryRiskObject(
  countryIso3: string,
  before?: string,
): Promise<
  GeomacroRiskObject | null
> {
  const db =
    requireRiskSupabase();

  const iso3 =
    countryIso3
      .trim()
      .toUpperCase();

  if (
    !/^[A-Z]{3}$/.test(iso3)
  ) {
    throw new Error(
      "countryIso3 must be ISO3",
    );
  }

  let query =
    db
      .from(
        "geomacro_risk_objects",
      )
      .select(
        "object_id,payload,generated_at,expires_at",
      )
      .eq(
        "subject_type",
        "country",
      )
      .eq(
        "subject_id",
        iso3,
      )
      .eq(
        "schema_version",
        GRO_SCHEMA_VERSION,
      )
      .eq(
        "methodology_version",
        COUNTRY_RISK_METHOD_VERSION,
      )
      .order(
        "generated_at",
        {
          ascending: false,
        },
      )
      .limit(1);

  if (before) {
    query =
      query.lt(
        "generated_at",
        before,
      );
  }

  const result =
    await query
      .maybeSingle();

  if (result.error) {
    throw result.error;
  }

  if (!result.data) {
    return null;
  }

  const row =
    result.data as RiskObjectRow;

  if (
    !isCompatibleCountryRiskObject(
      row.payload,
      iso3,
    )
  ) {
    throw new Error(
      `Stored GRO payload contract mismatch: ${row.object_id}`,
    );
  }

  return row.payload;
}


export async function
getRiskObjectByObjectId(
  objectId: string,
): Promise<
  GeomacroRiskObject | null
> {
  const db =
    requireRiskSupabase();

  const result =
    await db
      .from(
        "geomacro_risk_objects",
      )
      .select(
        "object_id,payload,generated_at,expires_at",
      )
      .eq(
        "object_id",
        objectId,
      )
      .maybeSingle();

  if (result.error) {
    throw result.error;
  }

  if (!result.data) {
    return null;
  }

  return (
    result.data as RiskObjectRow
  ).payload as GeomacroRiskObject;
}
