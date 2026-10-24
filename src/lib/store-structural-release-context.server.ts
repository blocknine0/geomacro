import type { AgentQueryPlan } from "./agent-query-plan";
import { loadStructuralContext, type StructuralContext, type StructuralSubject } from "./structural-context.server";
import { loadQualifiedMcsCountryContext } from "./qualified-mcs-country-digest.server";
import { loadQualifiedTreasuryFxCountryContext } from "./qualified-treasury-fx.server";
import { isStructuralStoreProduct } from "./store-product-selection";
import { storeProductRows } from "./store-product-evidence.server";

const key = (subject: StructuralSubject) => subject.type === "country"
  ? `country:${subject.country_iso3}`
  : `corridor:${subject.origin_country_iso3}>${subject.destination_country_iso3}`;

/** Reuse the existing exact-release qualification for explicit Store scope.
 * A corridor reads each endpoint independently; a profile retains every
 * requested dimension. Missing data stays missing. This never issues a GRO,
 * grants source rights, queries Supabase directly or changes a source clock.
 */
export async function loadAgentQueryStructuralContext(plan: AgentQueryPlan, subject: StructuralSubject): Promise<StructuralContext> {
  if (!isStructuralStoreProduct(plan.product)) {
    return loadStructuralContext(subject, {
      allowQualifiedRelease: plan.delivery_tier === "structural_baseline" && plan.topics.length === 1 &&
        ["critical_minerals", "fx_external_risk"].includes(plan.topics[0]),
      qualifiedReleaseTopic: plan.topics[0],
    });
  }
  if (plan.subjects.length !== 1 || key(plan.subjects[0]) !== key(subject))
    throw Error("STORE_STRUCTURAL_CONTEXT_SCOPE_MISMATCH");
  const asOf = plan.as_of ?? new Date().toISOString();
  const countries = subject.type === "country" ? [subject.country_iso3]
    : [subject.origin_country_iso3, subject.destination_country_iso3];
  // Existing B2/curated serving remains usable. Do not let an absent archive
  // prevent an independently hash/rights-qualified official release read.
  let original: StructuralContext | null = null;
  try { original = await loadStructuralContext(subject); } catch { /* qualified releases have independent source/rights checks */ }
  if (original && key(original.subject) !== key(subject))
    throw Error("STORE_STRUCTURAL_CONTEXT_SUBJECT_MISMATCH");
  const availableRows = (context: StructuralContext, module: string) => context.status === "AVAILABLE"
    ? storeProductRows(plan, context, module, asOf) : [];
  if (original && plan.required_modules.every(module => countries.every(country =>
    availableRows(original!, module).some(row => row.country_iso3 === country)))) return original;

  const releases = await Promise.all(plan.required_modules.flatMap(module => countries.map(async country => {
    if (original && availableRows(original, module).some(row => row.country_iso3 === country)) return null;
    // These two readers already verify exact publisher bytes, scoped rights,
    // country identity and native reference periods. There is no generic
    // fallback that could turn a different module into the requested one.
    const release = module === "critical_minerals" ? await loadQualifiedMcsCountryContext(country)
      : module === "external_fx" ? await loadQualifiedTreasuryFxCountryContext(country) : null;
    if (!release || release.status !== "AVAILABLE" || key(release.subject) !== `country:${country}`) return null;
    return { module, release };
  })));
  const observations = [
    ...plan.required_modules.flatMap(module => original ? availableRows(original, module) : []),
    ...releases.flatMap(entry => entry ? storeProductRows(plan, entry.release, entry.module, asOf) : []),
  ];
  const unique = [...new Map(observations.map(row => [
    `${row.country_iso3}:${row.dimension}:${row.normalized_hash}`, row,
  ])).values()];
  if (!unique.length && original) return original;
  return {
    status: unique.length ? "AVAILABLE" : "UNAVAILABLE",
    methodology_status: "EVIDENCE_ONLY_NOT_IN_GRI_V1_2",
    subject, observations: unique,
    metadata: {
      serving_layer: "QUALIFIED_RELEASE_DERIVED_V1",
      warehouse_methodology_status: "EVIDENCE_ONLY_NOT_IN_GRO_V02",
      coverage: original?.metadata.coverage.filter(row => countries.includes(row.country_iso3)) ?? [],
      composition_method: subject.type === "corridor" ? "ENDPOINT_COMPOSED_V0_1" : null,
      route_modeling_status: subject.type === "corridor" ? "NOT_MODELED" : null,
      direct_evidence_status: subject.type === "corridor" ? "NO_DIRECT_BILATERAL_EVIDENCE" : null,
    },
    note: "Qualified derived structural observations only. Each requested endpoint and dimension must pass separate freshness, source-rights and Store admission checks. Annual or quarterly reference periods are not current event publication clocks; no calibrated score, physical route or signed GRO is created.",
  };
}
