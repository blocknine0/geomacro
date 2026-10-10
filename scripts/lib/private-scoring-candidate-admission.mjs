
// PRIVATE staging accepts ONLY a source HTTPS URL whose host is the original
// publisher host; GDELT is not counted as the publisher. Never "repair"
// unverified http: origins by changing the scheme, or silently follow a redirect.
// Source-native publication time is a separate mandatory PUBLIC gate.
// Only the native publication-time evidence types that the bounded
// first-party RSS/Atom/original-article verifiers actually emit. A naked
// nativePublishedAtVerified=true boolean must not suffice.
export const PRIVATE_NATIVE_PUBLICATION_EVIDENCE = Object.freeze([
  "publisher_rss_item_pubDate",
  "publisher_atom_entry_published",
  "publisher_original_article_datePublished",
]);

export function privatePublisherPreAdmission(article, {
  now = new Date(),
  freshnessMs = 24 * 60 * 60 * 1000,
  // Only on the original-publisher PRIVATE model-budget path; do not conflate
  // indexed-seen times or third-party timestamps with publication evidence.
  requireOriginalPublisherProof = false,
} = {}) {
  let url;
  try { url = new URL(String(article?.url ?? "")); }
  catch { return { ok: false, reason: "publisher_url_invalid" }; }
  if (url.protocol !== "https:" || url.username || url.password ||
      url.hostname.length < 4 || !url.hostname.includes(".") ||
      /^(?:\d{1,3}\.){3}\d{1,3}$/u.test(url.hostname) ||
      url.hostname.startsWith("[") || url.href.length > 2048) {
    return { ok: false, reason: "publisher_url_invalid" };
  }
  const hostname = url.hostname.toLowerCase();
  const domain = String(article?.sourceDomain ?? "").trim().toLowerCase();
  // GDELT discovery strips the leading www. label, but the signed private
  // source identity must preserve the exact article URL hostname. Accept
  // ONLY this one verified hostname alias; never another host/subdomain.
  const wwwAlias = hostname.startsWith("www.") && domain === hostname.slice(4);
  if (!domain || (hostname !== domain && !wwwAlias)) {
    return { ok: false, reason: "publisher_domain_mismatch" };
  }
  const title = String(article?.title ?? "").trim().replace(/\s+/gu, " ");
  if (title.length < 16) {
    return { ok: false, reason: "publisher_title_missing" };
  }
  // Standard event-coding separation: discovery first; only first-party
  // observed publisher-time evidence is eligible to consume the scarce
  // canonical classifier quota. This is still PRIVATE PRE-ADMISSION only.
  // Actual authenticity, exact event identity, same-event corroboration,
  // rights and signed commercial readiness are checked downstream.
  if (requireOriginalPublisherProof && (
      article?.discoveryProvider !== "official_native_rss" ||
      article?.nativePublishedAtVerified !== true ||
      !PRIVATE_NATIVE_PUBLICATION_EVIDENCE.includes(article?.nativeTimeEvidence) ||
      article?.privateOnly !== true ||
      article?.rightsVerified !== false ||
      article?.commercialEligible !== false)) {
    return { ok: false, reason: "publisher_native_publication_unverified" };
  }
  const stamped = Date.parse(String(article?.publishedAt ?? ""));
  if (!Number.isFinite(stamped) ||
      now.getTime() - stamped > freshnessMs ||
      stamped - now.getTime() > (requireOriginalPublisherProof ? 0 : 5 * 60_000)) {
    return { ok: false, reason: "publisher_time_unavailable" };
  }
  return { ok: true, reason: "transport_admitted" };
}

// Private per-domain classifier processes receive a GROQ quota of 3
// requests: at most 2 independent candidates and 1 reserved retry.
// Mainline multi-domain ingestion retains the original stricter split.
export function privateSingleDomainCandidateLimit({
  requestBudget,
  batchSize,
  maxCandidates,
  privateMode = false,
  categoryCount = 3,
}) {
  const requests = Number(requestBudget);
  const batch = Number(batchSize);
  const max = Number(maxCandidates);
  const cats = privateMode ? 1 : categoryCount;
  if (!Number.isSafeInteger(requests) || requests < 2 ||
      !Number.isSafeInteger(batch) || batch < 1 ||
      !Number.isSafeInteger(max) || max < 1 ||
      !Number.isSafeInteger(cats) || cats < 1) {
    throw new Error("PRIVATE_SCORING_BOUNDED_BUDGET_INVALID");
  }
  const reserve = privateMode ? 1 : Math.max(2, Math.ceil(requests * 0.2));
  return Math.max(1, Math.min(max,
    Math.floor(Math.max(1, requests - reserve) * batch / cats)));
}
