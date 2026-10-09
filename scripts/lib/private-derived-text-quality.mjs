// PRIVATE archive preparation only. Public/paid editorial quality remains
// independent and fail-closed; preserving long *classified* text is NOT an
// authorization to sell or publish it.
// Bounded 4,000 chars per field: <=6 private rows + metadata fit 80KiB.
export const PRIVATE_MODEL_TEXT_MAX = 4000;
export const PUBLIC_NARRATIVE_TARGET_MAX = 300;
export const PUBLIC_SUMMARY_TARGET_MAX = 850;
const MIN = 12;

function normalizedModelString(value) {
  if (typeof value !== "string") return { reason: "missing" };
  // Reject hidden ASCII controls except ordinary whitespace before collapse.
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(value)) {
    return { reason: "control_invalid" };
  }
  const text = value.replace(/<[^>]*>/gu, " ").replace(/\s+/gu, " ").trim();
  if (text.length < MIN) return { reason: "too_short" };
  if (text.length > PRIVATE_MODEL_TEXT_MAX) return { reason: "too_long_private" };
  return { text, reason: "valid" };
}

export function classifyPrivateDerivedTextQuality(assessment) {
  const narrative = normalizedModelString(assessment?.narrative);
  const summary = normalizedModelString(assessment?.summary);
  return {
    narrative: narrative.reason,
    summary: summary.reason,
    narrative_length_band: !narrative.text ? "invalid" :
      narrative.text.length > PUBLIC_NARRATIVE_TARGET_MAX ? "verbose_private" : "concise",
    summary_length_band: !summary.text ? "invalid" :
      summary.text.length > PUBLIC_SUMMARY_TARGET_MAX ? "verbose_private" : "concise",
    has_any_substantive_classifier_text: !!(narrative.text || summary.text),
  };
}

export function preparePrivateDerivedText(assessment) {
  const narrative = normalizedModelString(assessment?.narrative);
  const summary = normalizedModelString(assessment?.summary);
  if (!narrative.text && !summary.text) {
    // No publisher raw headline or generic placeholder is ever invented.
    throw new Error("PRIVATE_SCORING_DERIVED_BOTH_FIELDS_INVALID");
  }
  if (narrative.reason === "control_invalid" ||
      summary.reason === "control_invalid") {
    throw new Error("PRIVATE_SCORING_DERIVED_CONTROL_INVALID");
  }
  // If exactly one MODEL-classification-derived field is substantive, keep
  // that same text for both private fields (not a generated rewrite).
  // Mark editorial review to prevent treating duplicates as launch-ready.
  const narrativeText = narrative.text || summary.text;
  const summaryText = summary.text || narrative.text;
  const editorialReviewPending =
    !narrative.text || !summary.text ||
    narrativeText.length > PUBLIC_NARRATIVE_TARGET_MAX ||
    summaryText.length > PUBLIC_SUMMARY_TARGET_MAX;

  return {
    narrative: narrativeText,
    summary: summaryText,
    editorial_review_pending: editorialReviewPending,
    // No source identity, publisher title or original text appears here.
    quality: classifyPrivateDerivedTextQuality(assessment),
  };
}

export function validatePrivateDerivedRecord(row) {
  const narrative = normalizedModelString(row?.narrative);
  const summary = normalizedModelString(row?.summary);
  if (!narrative.text || !summary.text ||
      typeof row?.editorial_review_pending !== "boolean" ||
      (narrative.text.length > PUBLIC_NARRATIVE_TARGET_MAX ||
       summary.text.length > PUBLIC_SUMMARY_TARGET_MAX) &&
       row.editorial_review_pending !== true) {
    throw new Error("PRIVATE_SCORING_DERIVED_RECORD_INVALID");
  }
  return true;
}
