import type { AgentQueryPlan } from "./agent-query-plan";
import type { QualifiedSubjectEvidence } from "./agent-query-qualified-evidence.server";
import { sourceNativeObservationTime } from "./source-native-observation-time";
import { canonicalStructuralEvidence } from "./canonical-structural-evidence";
import { isStoreProfile, isStructuralStoreProduct } from "./store-product-selection";
import { verifyCommercialRiskObjectArtifact } from "./commercial-risk-object-policy";
import type { StructuralContext } from "./structural-context.server";

const dimensions: Record<string, readonly string[]> = {
  sovereign_fiscal: ["sovereign_fiscal", "fiscal", "sovereign", "debt"],
  macro_monetary: ["macro_monetary", "macro", "monetary"],
  external_fx: ["external_fx", "currency_capital_mobility", "fx", "external", "currency", "capital_mobility"],
  geopolitical_security: ["geopolitical_security", "conflict", "security", "geopolitical"],
  critical_minerals: ["critical_minerals", "minerals"],
};
const fresh = (stamp: number | null, now: number, maxAge: number) => stamp !== null &&
  Number.isFinite(stamp) && Number.isFinite(maxAge) && maxAge > 0 && stamp <= now && now - stamp <= maxAge * 1000;

export function storeProductRows(plan: AgentQueryPlan, context: StructuralContext, module: string, asOf: string) {
  const subject = plan.subjects[0], now = Date.parse(asOf);
  const countries = subject.type === "country" ? [subject.country_iso3]
    : [subject.origin_country_iso3, subject.destination_country_iso3];
  const rows = context.observations.filter(row => countries.includes(row.country_iso3 ?? "") &&
    (dimensions[module] ?? [module]).includes(row.dimension.trim().toLowerCase()) &&
    canonicalStructuralEvidence(row, asOf) !== null &&
    fresh(sourceNativeObservationTime(row, now), now, plan.module_max_age_seconds[module]));
  if (subject.type === "country") return rows;
  // Preserve at least one actual observation from each endpoint before the
  // digest/profile bound is applied, even if origin rows dominate the feed.
  const firsts = countries.map(country => rows.find(row => row.country_iso3 === country)).filter(row => row !== undefined);
  return [...new Set([...firsts, ...rows])];
}

/** Check exact country/corridor scope using the private evidence already read
 * by admission. Neither a coverage timestamp nor one fresh endpoint can stand
 * in for every dimension of both ends of a paid corridor profile. */
export function assertStoreStructuralEvidence(plan: AgentQueryPlan, evidence: {
  asOf: string; subjects: QualifiedSubjectEvidence[];
}) {
  if (!isStructuralStoreProduct(plan.product)) return;
  if (plan.subjects.length !== 1 || evidence.subjects.length !== 1) throw Error("STORE_STRUCTURAL_EVIDENCE_SCOPE_INVALID");
  const subject = plan.subjects[0], qualified = evidence.subjects[0], context = qualified.context;
  const actual = context.subject;
  if (actual.type !== subject.type || (subject.type === "country"
    ? actual.type !== "country" || actual.country_iso3 !== subject.country_iso3
    : actual.type !== "corridor" || actual.origin_country_iso3 !== subject.origin_country_iso3 ||
      actual.destination_country_iso3 !== subject.destination_country_iso3))
    throw Error("STORE_STRUCTURAL_EVIDENCE_SUBJECT_MISMATCH");
  const now = Date.parse(evidence.asOf);
  if (!Number.isFinite(now)) throw Error("STORE_STRUCTURAL_EVIDENCE_CLOCK_INVALID");
  const countries = subject.type === "country" ? [subject.country_iso3]
    : [subject.origin_country_iso3, subject.destination_country_iso3];
  if (subject.type === "corridor" && (context.status !== "AVAILABLE" ||
      context.metadata.composition_method !== "ENDPOINT_COMPOSED_V0_1" ||
      context.metadata.route_modeling_status !== "NOT_MODELED"))
    throw Error("STORE_CORRIDOR_COMPOSITION_UNVERIFIED");
  if (isStoreProfile(plan.product) && new Set(plan.required_modules).size < 2)
    throw Error("STORE_PROFILE_MULTIDIMENSION_EVIDENCE_REQUIRED");
  for (const country of countries) for (const module of plan.required_modules) {
    const rows = storeProductRows(plan, context, module, evidence.asOf).filter(row => row.country_iso3 === country);
    if (context.status === "AVAILABLE" && rows.length) continue;
    // Governed fallback states are country modules, never a fabricated
    // destination or bilateral relationship inferred from an origin state.
    const fallback = module === "critical_minerals" ? qualified.minerals
      : qualified.worldBank[module as keyof typeof qualified.worldBank];
    if (subject.type === "country" && fallback?.deliverable && fallback.state &&
        fallback.subject.type === "country" && fallback.subject.country_iso3 === country &&
        fallback.source_normalized_hashes.some(hash => /^[a-f0-9]{64}$/u.test(hash)) &&
        fresh(Date.parse(fallback.source_observed_at ?? ""), now, plan.module_max_age_seconds[module])) continue;
    throw Error("STORE_STRUCTURAL_ENDPOINT_MODULE_UNVERIFIED");
  }
}

/** New means a real signature-verified publication after a recent requested
 * cutoff, not a caller-provided lifecycle flag or a renewed expiry. The
 * publisher remains separate: an HTTP preflight never creates a signature. */
export function storeSignedObjectLifecycle(plan: AgentQueryPlan, evidence: {
  asOf: string; subjects: QualifiedSubjectEvidence[];
} | null, now: Date): "existing" | "new" {
  if (plan.product?.capability !== "signed_risk_object" || plan.product.variant !== "newly_qualified_signed") return "existing";
  const after = Date.parse(plan.product.issued_after ?? "");
  if (!evidence || evidence.subjects.length !== 1 || !Number.isFinite(after) ||
      after > now.getTime() || now.getTime() - after > 300_000)
    throw Error("STORE_NEW_SIGNED_ISSUANCE_REQUEST_UNVERIFIED");
  const object = evidence.subjects[0].riskObject;
  const generated = Date.parse(object?.generated_at ?? "");
  const subject = plan.subjects[0];
  const expectedId = subject.type === "country" ? subject.country_iso3 : `${subject.origin_country_iso3}>${subject.destination_country_iso3}`;
  if (!object || !verifyCommercialRiskObjectArtifact(object, { now }).deliverable ||
      !Number.isFinite(generated) || generated < after || generated > now.getTime() ||
      object.subject.type !== subject.type || object.subject.id !== expectedId)
    throw Error("STORE_NEW_SIGNED_PUBLICATION_NOT_AVAILABLE");
  return "new";
}
