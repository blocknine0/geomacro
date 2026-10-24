/**
 * Auditable coverage accounting for the existing scheduled LOW original reviewer.
 * Every distinct retained signed-derived input must be in EXACTLY ONE state:
 * previously source-verified, trusted rejection cooldown, or attempted/
 * explicitly pending this run. This check grants NO qualification by itself.
 * Never serialize article IDs, private refs, URLs, source HTML or review keys.
 */
const CATEGORIES = ["geopolitics", "macro", "rare_earth"];
const VERIFIED = "ORIGINAL_PAGE_BYTES_AND_NATIVE_TIME_VERIFIED";
const STATES = new Set([
  VERIFIED,
  "PRIVATE_ORIGINAL_REFERENCE_NOT_AVAILABLE",
  "ORIGINAL_DAY_PRECISION_ONLY",
  "OUTSIDE_TWENTY_TWO_HOUR_ORIGINAL_VERIFICATION_WINDOW",
  "ORIGINAL_ISSUER_NOT_REGISTERED_FOR_BYTE_RECHECK",
  "ORIGINAL_PAGE_READBACK_DEFERRED_QUOTA",
  "ORIGINAL_BYTES_OR_NATIVE_CLOCK_UNVERIFIED",
]);
const safeId = /^(?:geopolitics|macro|rare_earth)-[a-f0-9]{8}$/u;
const fail = () => { throw Error("AUTOMATIC_NEWS_QUALIFICATION_COVERAGE_INCOMPLETE"); };

export function automaticNewsQualificationCoverage({
  retainedSignals, auditedRows, reusedVerifiedIds, cooldownIds, reviewedIds,
} = {}) {
  if (!Array.isArray(retainedSignals) || retainedSignals.length > 600 ||
      !Array.isArray(auditedRows) || auditedRows.length > 600 ||
      ![reusedVerifiedIds, cooldownIds, reviewedIds].every(x => x instanceof Set))
    fail();
  const all = new Map();
  for (const signal of retainedSignals) {
    if (!signal || !safeId.test(signal.id ?? "") ||
        !CATEGORIES.includes(signal.category) ||
        signal.id.slice(0, signal.id.lastIndexOf("-")) !== signal.category ||
        all.has(signal.id)) fail();
    all.set(signal.id, signal);
  }
  const audited = new Map();
  for (const row of auditedRows) {
    if (!row || !all.has(row.id) || audited.has(row.id) ||
        row.category !== all.get(row.id).category ||
        !STATES.has(row.original_page_evidence_status) ||
        row.exact_original_page_html_readback !==
          (row.original_page_evidence_status === VERIFIED)) fail();
    audited.set(row.id, row);
  }
  const sets = [reusedVerifiedIds, cooldownIds, reviewedIds];
  for (const set of sets) {
    if (set.size > all.size || [...set].some(id => !all.has(id))) fail();
  }
  // Reused and cooled-down items must be previously signed; every audited
  // item must also have a signed NEW or safely reused pending review.
  for (const id of all.keys()) {
    const membership = sets.filter(set => set.has(id)).length;
    if (membership !== 1 || audited.has(id) !== reviewedIds.has(id)) fail();
  }
  const perCategory = Object.fromEntries(CATEGORIES.map(category => {
    const ids = [...all.keys()].filter(id => all.get(id).category === category);
    const newlyVerified = ids.filter(id =>
      audited.get(id)?.original_page_evidence_status === VERIFIED).length;
    const previouslyVerified = ids.filter(id => reusedVerifiedIds.has(id)).length;
    const rejectedCooldown = ids.filter(id => cooldownIds.has(id)).length;
    return [category, Object.freeze({
      retained: ids.length,
      newly_source_verified: newlyVerified,
      previously_source_verified: previouslyVerified,
      rejected_cooldown: rejectedCooldown,
      pending_or_unverified: ids.length - newlyVerified - previouslyVerified,
    })];
  }));
  const sum = key => CATEGORIES.reduce((n,c) => n + perCategory[c][key], 0);
  return Object.freeze({
    schema: "geomacro.automatic-news-qualification-coverage.v1",
    all_retained_unique_inputs_accounted_for: true,
    retained_unique_derived_inputs: all.size,
    reviewed_or_pending_this_run: audited.size,
    previously_verified_source_proofs_reused: sum("previously_source_verified"),
    rejected_source_retry_cooldowns: sum("rejected_cooldown"),
    source_pages_verified_new: sum("newly_source_verified"),
    source_pages_verified_total: sum("newly_source_verified") + sum("previously_source_verified"),
    awaiting_evidence_or_unverified: sum("pending_or_unverified"),
    categories: perCategory,
    original_bytes_and_native_clock_required: true,
    independent_facts_review_verified: false,
    article_scoped_commercial_rights_verified: false,
    signed_commercial_products_approved: false,
    automatic_paid_delivery_authorized: false,
  });
}
