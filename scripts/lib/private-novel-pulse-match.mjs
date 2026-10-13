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
  const identity = createHash("sha256").update(original.href).digest("hex");
  return hashes.has(identity);
}
