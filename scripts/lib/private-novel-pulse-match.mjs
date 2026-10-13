import { createHash } from "node:crypto";

// Private matching only. A URL digest proves identity, not article content,
// event truth, source rights, corroboration, or signing eligibility.
const SHA = /^[a-f0-9]{64}$/u;
const DOMAINS = ["geopolitics", "macro", "rare_earth"];
export function validatePrivatePulseRefs(domain, refs) {
  if (!DOMAINS.includes(domain) || !Array.isArray(refs) ||
      refs.length > 80 || new Set(refs).size !== refs.length ||
      refs.some(ref => typeof ref !== "string" || !SHA.test(ref)))
    throw Error("PRIVATE_PULSE_REFERENCE_INVALID");
  return new Set(refs);
}
export function privateOriginalMatchesPulse(article, hashes, now = Date.now()) {
  if (!(hashes instanceof Set) || !article ||
      article.discoveryProvider !== "official_native_rss" ||
      article.nativePublishedAtVerified !== true ||
      article.privateOnly !== true ||
      article.rightsVerified !== false ||
      article.commercialEligible !== false ||
      typeof article.url !== "string" || article.url.length > 2048 ||
      typeof article.sourceDomain !== "string" ||
      !Number.isFinite(now)) return false;
  let original;
  try { original = new URL(article.url); } catch { return false; }
  if (original.protocol !== "https:" || original.username ||
      original.password || original.hostname !== article.sourceDomain)
    return false;
  const published = Date.parse(article.publishedAt);
  if (!Number.isFinite(published) || published > now ||
      now - published > 24 * 60 * 60 * 1000) return false;
  for(const key of [...original.searchParams.keys()]) {
    if(/^utm_|^(?:fbclid|gclid|mc_cid|mc_eid)$/iu.test(key))
      original.searchParams.delete(key);
  }
  original.searchParams.sort();
  const identity = createHash("sha256").update(original.href).digest("hex");
  return hashes.has(identity);
}

const DATE = /^20\d{2}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;

// Validate the *actual* D1 proof for this 30-minute window before calling
// any private model. A different recent feed does not satisfy the trigger.
export function selectPrivateNovelPulseRefs(row, domain, now = Date.now()) {
  const p = row?.payload;
  const stamp = p?.checked_at;
  const checked = typeof stamp === "string" && DATE.test(stamp)
    ? Date.parse(stamp) : NaN;
  const refs = validatePrivatePulseRefs(domain, p?.newly_seen_private_article_refs);
  const retained = p?.recent_private_article_fingerprints;
  if (p?.schema !== "geomacro.private-source-pulse-checkpoint.v1" ||
      p.domain !== domain || row?.last_attempt_at !== stamp ||
      !Number.isFinite(now) || !Number.isFinite(checked) ||
      checked > now || now - checked > 45 * 60 * 1000 ||
      p.commercial_eligible !== false ||
      p.original_review_claims_verified !== false ||
      !Number.isSafeInteger(p.new_private_article_fingerprint_count) ||
      p.new_private_article_fingerprint_count !== refs.size ||
      !Array.isArray(retained) || retained.length > 240)
    throw Error("PRIVATE_PULSE_D1_READBACK_UNVERIFIED");
  const history = new Set();
  for (const item of retained) {
    if (item?.domain !== domain || !SHA.test(String(item.article_sha256)) ||
        !DATE.test(String(item.native_published_at)) ||
        history.has(item.article_sha256))
      throw Error("PRIVATE_PULSE_D1_HISTORY_UNVERIFIED");
    const t = Date.parse(item.native_published_at);
    if (!Number.isFinite(t) || t > now || now - t > 30 * 60 * 60 * 1000)
      throw Error("PRIVATE_PULSE_D1_HISTORY_UNVERIFIED");
    history.add(item.article_sha256);
  }
  if ([...refs].some(ref => !history.has(ref)) ||
      (refs.size && p.original_publisher_date_observed !== true))
    throw Error("PRIVATE_PULSE_D1_READBACK_UNVERIFIED");
  return refs;
}
