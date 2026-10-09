import { isIP } from "node:net";

// PRIVATE staging accepts ONLY a source HTTPS URL whose host is the original
// publisher host; GDELT is not counted as the publisher. Never "repair"
// unverified http: origins by changing the scheme, or silently follow a redirect.
// Source-native publication time is a separate mandatory PUBLIC gate.
export function privatePublisherPreAdmission(article, {
  now = new Date(),
  freshnessMs = 24 * 60 * 60 * 1000,
} = {}) {
  let url;
  try { url = new URL(String(article?.url ?? "")); }
  catch { return { ok: false, reason: "publisher_url_invalid" }; }
  if (url.protocol !== "https:" || url.username || url.password ||
      url.hostname.length < 4 || !url.hostname.includes(".") ||
      isIP(url.hostname) || url.href.length > 2048) {
    return { ok: false, reason: "publisher_url_invalid" };
  }
  const hostname = url.hostname.toLowerCase();
  const domain = String(article?.sourceDomain ?? "").trim().toLowerCase();
  if (!domain || hostname !== domain) {
    return { ok: false, reason: "publisher_domain_mismatch" };
  }
  const title = String(article?.title ?? "").trim().replace(/\s+/gu, " ");
  if (title.length < 16) {
    return { ok: false, reason: "publisher_title_missing" };
  }
  const stamped = Date.parse(String(article?.publishedAt ?? ""));
  if (!Number.isFinite(stamped) ||
      now.getTime() - stamped > freshnessMs ||
      stamped - now.getTime() > 5 * 60_000) {
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
