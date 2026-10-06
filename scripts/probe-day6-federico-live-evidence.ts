#!/usr/bin/env node
import { dryRunCountryRiskObject } from "../src/lib/country-risk-publisher.server";
import { assertFedericoPublicationReady } from "../src/lib/federico-publication-policy";

const iso3 = String(
  process.argv[2] ?? process.env.DAY6_COUNTRY_ISO3 ?? "",
).trim().toUpperCase();

if (!/^[A-Z]{3}$/.test(iso3)) {
  throw new Error("DAY6_COUNTRY_ISO3 must be exactly three uppercase letters");
}

const evaluatedAt = new Date().toISOString();

try {
  const result = await dryRunCountryRiskObject({
    country_iso3: iso3,
    delivery_profile: "FEDERICO_STRICT",
  });

  let ready = true;
  let reason: string | null = null;
  try {
    assertFedericoPublicationReady(result.object);
  } catch (error) {
    ready = false;
    reason = error instanceof Error ? error.message : String(error);
  }

  console.log(JSON.stringify({
    ok: true,
    schema: "geomacro.day6-global-strict-evidence-probe.v2",
    evaluated_at: evaluatedAt,
    country_iso3: iso3,
    ready,
    reason,
    object: {
      schema_version: result.object.schema_version,
      subject: result.object.subject,
      decision_readiness: result.object.decision_readiness,
      commercial_eligibility: result.object.commercial_eligibility,
      verification: result.object.verification,
      evidence_summary: result.object.evidence_summary,
      calculation_namespace:
        result.object.provenance?.reproducibility?.calculation_namespace ?? null,
    },
    context: result.context,
    policy: {
      profile: "FEDERICO_STRICT",
      country_scope: "any_enabled_iso3",
      threshold_weakening: false,
      fake_freshness: false,
      fail_closed_when_not_ready: true,
    },
    production_data_read_only: true,
    signed_object_created: false,
    b2_write_performed: false,
    partner_review_attempted: false,
    partner_allowance_spent: false,
    payment_performed: false,
    execution_authorized: false,
  }, null, 2));
} catch (error) {
  console.log(JSON.stringify({
    ok: true,
    schema: "geomacro.day6-global-strict-evidence-probe.v2",
    evaluated_at: evaluatedAt,
    country_iso3: iso3,
    ready: false,
    reason: error instanceof Error ? error.message : String(error),
    policy: {
      profile: "FEDERICO_STRICT",
      country_scope: "any_enabled_iso3",
      threshold_weakening: false,
      fake_freshness: false,
      fail_closed_when_not_ready: true,
    },
    production_data_read_only: true,
    signed_object_created: false,
    b2_write_performed: false,
    partner_review_attempted: false,
    partner_allowance_spent: false,
    payment_performed: false,
    execution_authorized: false,
  }, null, 2));
}
