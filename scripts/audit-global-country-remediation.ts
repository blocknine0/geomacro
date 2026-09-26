#!/usr/bin/env bun

import { classifyGlobalEntity } from "../src/lib/global-entity-classification";
import { verifyCommercialRiskObjectArtifact } from "../src/lib/commercial-risk-object-policy";
import { getLatestCompatibleCountryRiskObject } from "../src/lib/risk-object-store.server";
import { verifyRiskObjectSignature } from "../src/lib/risk-object-signing.server";
import { requireRiskSupabase } from "../src/lib/risk-supabase.server";

const CONCURRENCY = Math.max(
  1,
  Math.min(16, Number(process.env.GLOBAL_REMEDIATION_AUDIT_CONCURRENCY ?? 8)),
);
const BATCH_SIZE = 100;

type Country = {
  iso3: string;
  country_name: string;
  region: string | null;
  subregion: string | null;
};

type RightsRow = {
  event_id: string;
  evaluated_status: string;
  reason_codes: string[] | null;
  source_keys: string[] | null;
};

type EvidenceRow = {
  event_id: string;
  source_domain: string | null;
  fragment_id: string | null;
  country_iso3: string | null;
  country_confidence: number | null;
};

type EventRow = {
  id: string;
  primary_country: string | null;
  countries: string[] | null;
  event_type: string | null;
  severity: number | null;
  confidence: number | null;
};

type ManifestRow = {
  id: string;
  source_key: string | null;
};

function uniq(values: Array<string | null | undefined>) {
  return [...new Set(values.map((value) => String(value ?? "").trim()).filter(Boolean))].sort();
}

function chunks<T>(values: T[], size: number) {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

async function loadEnabledSovereigns(): Promise<Country[]> {
  const db = requireRiskSupabase();
  const result = await db
    .from("live_country_registry")
    .select("iso3,country_name,region,subregion")
    .eq("enabled", true)
    .order("iso3", { ascending: true });

  if (result.error) throw result.error;

  return (result.data ?? [])
    .map((row) => ({
      iso3: String(row.iso3 ?? "").trim().toUpperCase(),
      country_name: String(row.country_name ?? "").trim(),
      region: row.region == null ? null : String(row.region),
      subregion: row.subregion == null ? null : String(row.subregion),
    }))
    .filter(
      (row) => /^[A-Z]{3}$/.test(row.iso3) && classifyGlobalEntity(row.iso3) === "SOVEREIGN",
    );
}

function remediationAction(status: string, reasonCodes: string[]) {
  const reasons = new Set(reasonCodes);
  if (status === "INELIGIBLE" || reasons.has("commercial_source_ineligible")) {
    return "REPLACE_SOURCE_OR_OBTAIN_RIGHTS";
  }
  if (
    reasons.has("missing_structured_event_source_provenance") ||
    reasons.has("missing_commercial_source_policy")
  ) {
    return "REPAIR_PROVENANCE_OR_ADD_POLICY";
  }
  if (reasons.has("commercial_source_review_required")) {
    return "COMPLETE_RIGHTS_REVIEW_OR_REPLACE_SOURCE";
  }
  if (status === "UNVERIFIED") {
    return "RESOLVE_EVENT_COMMERCIAL_VERIFICATION";
  }
  return "REVIEW_COUNTRY_EVIDENCE_CHAIN";
}

async function loadLatestCountryStates(countries: Country[]) {
  const states = new Array<any>(countries.length);
  let cursor = 0;

  async function worker() {
    while (true) {
      const index = cursor++;
      if (index >= countries.length) return;
      const country = countries[index];
      const object = await getLatestCompatibleCountryRiskObject(country.iso3, undefined, "CANONICAL");

      if (!object) {
        states[index] = {
          ...country,
          status: "FAIL_CLOSED",
          object_id: null,
          verification_status: null,
          commercial_eligibility_status: null,
          signature_valid: false,
          country_reason_codes: ["missing_canonical_risk_object"],
          event_ids: [],
        };
        continue;
      }

      const signature = verifyRiskObjectSignature(object);
      const commercial = verifyCommercialRiskObjectArtifact(object);
      const paidReady = signature.valid === true && commercial.deliverable === true;

      states[index] = {
        ...country,
        status: paidReady ? "PAID_READY" : "FAIL_CLOSED",
        object_id: object.object_id,
        generated_at: object.generated_at,
        expires_at: object.expires_at,
        verification_status: object.verification.status,
        commercial_eligibility_status: object.commercial_eligibility.status,
        signature_valid: signature.valid,
        country_reason_codes: uniq([
          ...commercial.reason_codes,
          ...object.commercial_eligibility.reason_codes,
          ...object.verification.reason_codes,
        ]),
        event_ids: uniq(object.evidence.map((item) => item.event_id)),
      };
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
  return states;
}

async function loadEventDiagnostics(eventIds: string[]) {
  const db = requireRiskSupabase();
  const rightsRows: RightsRow[] = [];
  const evidenceRows: EvidenceRow[] = [];
  const eventRows: EventRow[] = [];

  for (const batch of chunks(eventIds, BATCH_SIZE)) {
    const [rights, evidence, events] = await Promise.all([
      db
        .from("live_structured_event_commercial_rights_evaluation")
        .select("event_id,evaluated_status,reason_codes,source_keys")
        .in("event_id", batch),
      db
        .from("live_structured_event_evidence")
        .select("event_id,source_domain,fragment_id,country_iso3,country_confidence")
        .in("event_id", batch),
      db
        .from("live_structured_events")
        .select("id,primary_country,countries,event_type,severity,confidence")
        .in("id", batch),
    ]);

    if (rights.error) throw rights.error;
    if (evidence.error) throw evidence.error;
    if (events.error) throw events.error;
    rightsRows.push(...((rights.data ?? []) as RightsRow[]));
    evidenceRows.push(...((evidence.data ?? []) as EvidenceRow[]));
    eventRows.push(...((events.data ?? []) as EventRow[]));
  }

  const fragmentIds = uniq(evidenceRows.map((row) => row.fragment_id));
  const manifestRows: ManifestRow[] = [];
  for (const batch of chunks(fragmentIds, BATCH_SIZE)) {
    if (batch.length === 0) continue;
    const result = await db
      .from("live_fragment_manifest")
      .select("id,source_key")
      .in("id", batch);
    if (result.error) throw result.error;
    manifestRows.push(...((result.data ?? []) as ManifestRow[]));
  }

  const sourceKeyByFragment = new Map(
    manifestRows.map((row) => [String(row.id), String(row.source_key ?? "").trim()]),
  );
  const rightsByEvent = new Map(rightsRows.map((row) => [row.event_id, row]));
  const eventById = new Map(eventRows.map((row) => [row.id, row]));
  const evidenceByEvent = new Map<string, EvidenceRow[]>();
  for (const row of evidenceRows) {
    const values = evidenceByEvent.get(row.event_id) ?? [];
    values.push(row);
    evidenceByEvent.set(row.event_id, values);
  }

  return new Map(
    eventIds.map((eventId) => {
      const rights = rightsByEvent.get(eventId);
      const event = eventById.get(eventId);
      const evidence = evidenceByEvent.get(eventId) ?? [];
      const status = String(rights?.evaluated_status ?? "UNVERIFIED");
      const reasonCodes = uniq(rights?.reason_codes ?? ["missing_commercial_rights_evaluation"]);
      const sourceKeys = uniq([
        ...(rights?.source_keys ?? []),
        ...evidence.map((row) => sourceKeyByFragment.get(String(row.fragment_id ?? ""))),
      ]);
      const sourceDomains = uniq(evidence.map((row) => row.source_domain?.toLowerCase() ?? null));
      const evidenceCountries = uniq(evidence.map((row) => row.country_iso3?.toUpperCase() ?? null));
      const eventCountries = uniq([
        event?.primary_country?.toUpperCase() ?? null,
        ...((event?.countries ?? []).map((country) => country?.toUpperCase() ?? null)),
      ]);

      return [
        eventId,
        {
          event_id: eventId,
          event_type: event?.event_type ?? null,
          severity: event?.severity ?? null,
          confidence: event?.confidence ?? null,
          primary_country: event?.primary_country?.toUpperCase() ?? null,
          event_countries: eventCountries,
          evidence_countries: evidenceCountries,
          evaluated_status: status,
          reason_codes: reasonCodes,
          source_keys: sourceKeys,
          source_domains: sourceDomains,
          remediation_action: remediationAction(status, reasonCodes),
        },
      ] as const;
    }),
  );
}

async function main() {
  if (!Number.isFinite(CONCURRENCY)) throw new Error("Invalid remediation audit concurrency");

  const generatedAt = new Date().toISOString();
  const countries = await loadEnabledSovereigns();
  const countryStates = await loadLatestCountryStates(countries);
  const failClosed = countryStates.filter((row) => row.status === "FAIL_CLOSED");
  const eventIds = uniq(failClosed.flatMap((row) => row.event_ids));
  const eventDiagnostics = await loadEventDiagnostics(eventIds);

  const actionCounts = new Map<string, number>();
  const sourceKeyCounts = new Map<string, number>();
  const sourceDomainCounts = new Map<string, number>();
  const regionCounts = new Map<string, number>();
  let possibleAttributionOverreachCountryCount = 0;

  const remediationCountries = failClosed.map((country) => {
    const events = country.event_ids
      .map((eventId: string) => eventDiagnostics.get(eventId))
      .filter(Boolean)
      .filter((event: any) => !["VERIFIED", "DERIVED_ONLY"].includes(event.evaluated_status))
      .map((event: any) => {
        const countryAttributionSupported =
          event.primary_country === country.iso3 ||
          event.event_countries.includes(country.iso3) ||
          event.evidence_countries.includes(country.iso3);
        return {
          ...event,
          country_attribution_supported: countryAttributionSupported,
          possible_attribution_overreach: !countryAttributionSupported,
        };
      });

    const actions = uniq(events.map((event: any) => event.remediation_action));
    if (events.length === 0 && country.country_reason_codes.includes("insufficient_country_evidence")) {
      actions.push("ADD_FRESH_ELIGIBLE_COUNTRY_EVIDENCE");
    }
    if (events.some((event: any) => event.possible_attribution_overreach)) {
      actions.push("REVIEW_EVENT_COUNTRY_ATTRIBUTION");
      possibleAttributionOverreachCountryCount += 1;
    }
    if (actions.length === 0) actions.push("REVIEW_COUNTRY_EVIDENCE_CHAIN");

    for (const action of actions) actionCounts.set(action, (actionCounts.get(action) ?? 0) + 1);
    for (const event of events) {
      for (const sourceKey of event.source_keys) {
        sourceKeyCounts.set(sourceKey, (sourceKeyCounts.get(sourceKey) ?? 0) + 1);
      }
      for (const domain of event.source_domains) {
        sourceDomainCounts.set(domain, (sourceDomainCounts.get(domain) ?? 0) + 1);
      }
    }
    const region = country.region || "UNSPECIFIED";
    regionCounts.set(region, (regionCounts.get(region) ?? 0) + 1);

    return {
      iso3: country.iso3,
      country_name: country.country_name,
      region: country.region,
      subregion: country.subregion,
      object_id: country.object_id,
      verification_status: country.verification_status,
      commercial_eligibility_status: country.commercial_eligibility_status,
      country_reason_codes: country.country_reason_codes,
      remediation_actions: actions.sort(),
      blocking_event_count: events.length,
      blocking_events: events,
    };
  });

  const report = {
    schema_version: "geomacro-global-country-remediation-v1",
    generated_at: generatedAt,
    denominator: countries.length,
    paid_ready_country_count: countryStates.length - failClosed.length,
    fail_closed_country_count: failClosed.length,
    summary: {
      remediation_action_country_counts: Object.fromEntries(
        [...actionCounts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])),
      ),
      possible_attribution_overreach_country_count: possibleAttributionOverreachCountryCount,
      blocking_source_key_event_counts: Object.fromEntries(
        [...sourceKeyCounts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])),
      ),
      blocking_source_domain_event_counts: Object.fromEntries(
        [...sourceDomainCounts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])),
      ),
      fail_closed_region_counts: Object.fromEntries(
        [...regionCounts.entries()].sort((a, b) => a[0].localeCompare(b[0])),
      ),
    },
    boundaries: {
      raw_source_urls_emitted: false,
      raw_source_material_emitted: false,
      source_domains_only_for_rights_remediation: true,
      event_titles_emitted: false,
      payment_performed: false,
      execution_authorized: false,
    },
    countries: remediationCountries,
  };

  const json = `${JSON.stringify(report, null, 2)}\n`;
  const output = String(process.env.GLOBAL_REMEDIATION_AUDIT_OUTPUT ?? "").trim();
  if (output) await Bun.write(output, json);
  console.log(json);
}

main().catch((error) => {
  console.error("GLOBAL_COUNTRY_REMEDIATION_AUDIT_FAILED");
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
