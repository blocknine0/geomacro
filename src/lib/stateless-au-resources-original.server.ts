/**
 * Bounded original-index recovery for the Australian Resources Minister.
 * This is NOT a signed risk proof. Only issuer-native original DAYS from
 * independently fetched, same-host article pages can produce unscored
 * website findings; news headline/URL/body never enter public products.
 */
import {
  selectOfficialTopic, type StatelessCategory, type StatelessSourceCandidate,
} from "./stateless-intelligence-model";
import { visiblePublisherText } from "./stateless-publisher-text";

const HOST = "www.minister.industry.gov.au";
const URL_ROOT = "https://" + HOST;
const LINK = /<a\b[^>]{0,1400}\bhref\s*=\s*["']([^"']{1,450})["'][^>]*>([\s\S]{1,900}?)<\/a>/giu;
const ARTICLE_H1 = /<h1\b[^>]{0,850}>([\s\S]{1,1300}?)<\/h1\s*>/iu;
const DAY = /\b([1-9]|[12]\d|3[01])\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(20\d{2})\b/iu;
const MONTH = ["january","february","march","april","may","june",
  "july","august","september","october","november","december"];
const LIMIT_MS = 30 * 24 * 60 * 60 * 1000;
const SAFE_PATH = /^\/king\/media\/[a-z0-9][a-z0-9-]{12,170}$/u;
const MAX_INDEX = 512 * 1024;
const MAX_ARTICLE = 256 * 1024;

function originalDay(value: string, now: number): string | null {
  const match = DAY.exec(value);
  if (!match) return null;
  const month = MONTH.indexOf(match[2].toLowerCase());
  if (month < 0) return null;
  const day = Number(match[1]), year = Number(match[3]);
  const epoch = Date.UTC(year, month, day);
  if (!Number.isFinite(epoch) || new Date(epoch).getUTCDate() !== day ||
      new Date(epoch).getUTCMonth() !== month || epoch > now ||
      now - epoch > LIMIT_MS) return null;
  return new Date(epoch).toISOString().slice(0,10);
}
function words(value: string): Set<string> {
  return new Set(value.toLowerCase().match(/[a-z]{5,}/gu) ?? []);
}
function titleMatches(a: string, b: string): boolean {
  const left = words(a), right = words(b);
  return left.size >= 3 && [...left].filter(x => right.has(x)).length >= Math.min(4,left.size);
}
function officialArticle(href: string): string | null {
  try {
    const u = new URL(href, URL_ROOT);
    if (u.protocol !== "https:" || u.hostname !== HOST || u.username ||
        u.password || u.port || u.hash || u.search || !SAFE_PATH.test(u.pathname))
      return null;
    return u.href;
  } catch { return null; }
}

export function australianResourcesIndexCandidates(
  html: string, category: StatelessCategory, now = Date.now(),
): StatelessSourceCandidate[] {
  if (typeof html !== "string" || html.length > MAX_INDEX ||
      !Number.isFinite(now) || !["macro","rare_earth"].includes(category) ||
      /<!DOCTYPE\s+[^>]*\[/iu.test(html)) return [];
  const matched = [...html.matchAll(LINK)].slice(0,150);
  const findings: StatelessSourceCandidate[] = [];
  const seen = new Set<string>();
  for (const anchor of matched) {
    if (findings.length >= 5) break;
    const link = officialArticle(anchor[1]);
    if (!link || seen.has(link)) continue;
    const title = visiblePublisherText(anchor[2]);
    if (title.length < 12 || title.length > 260 || !selectOfficialTopic(title,category))
      continue;
    // Index date is provisional. The same original calendar day MUST also
    // appear directly after the matching first-party article h1.
    const before = html.slice(Math.max(0,(anchor.index ?? 0)-1100),anchor.index ?? 0);
    const publishedAt = originalDay(visiblePublisherText(before),now);
    if (!publishedAt) continue;
    seen.add(link);
    findings.push({ sourceId:category === "macro" ? "au_resources_macro_index"
      : "au_resources_minerals_index",category,title,articleUrl:link,
      publishedAt,datePrecision:"day",credit:null });
  }
  return findings;
}

export function verifyAustralianResourcesOriginalArticle(
  html: string, candidate: StatelessSourceCandidate, now = Date.now(),
): boolean {
  if (typeof html !== "string" || html.length === 0 || html.length > MAX_ARTICLE ||
      candidate.datePrecision !== "day" || !officialArticle(candidate.articleUrl) ||
      !Number.isFinite(now)) return false;
  const match = ARTICLE_H1.exec(html);
  if (!match || !titleMatches(candidate.title,visiblePublisherText(match[1])))
    return false;
  const after = html.slice(match.index + match[0].length,
    match.index + match[0].length + 1800);
  // The first publisher-visible calendar date after H1 is the one in its
  // article header. A later body date or last-updated timestamp does not
  // substitute for a missing native publication day.
  const visible = visiblePublisherText(after);
  const native = originalDay(visible.slice(0,850),now);
  return native !== null && native === candidate.publishedAt;
}
