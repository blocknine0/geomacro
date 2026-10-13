/**
 * Statistics Canada Daily: privately verify ORIGINAL article publication day.
 * Atom <updated> is never a release clock. URL + article "Released:" day
 * must independently agree; a page Date modified / crawl time is irrelevant.
 * Never expose publisher HTML, URL or original title to customers.
 */
import { visiblePublisherText } from "./stateless-publisher-text";

const ARTICLE_PATH = /^\/n1\/daily-quotidien\/(\d{2})(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])\/dq\d{6}[a-z]-eng\.htm$/i;
const DAY_MS = 86_400_000;
const MAX_AGE_MS = 30 * DAY_MS;
const STOP = new Set(["the","daily","with","from","about","canada","statistic","statistics","release","released","data","survey","monthly"]);

function words(value: string): string[] {
  return (value.toLowerCase().match(/[a-z]{5,}/g) ?? [])
    .filter(w=>!STOP.has(w));
}
export function verifiedStatcanOriginalReleaseDay(
  html: unknown,
  articleUrl: unknown,
  feedTitle: unknown,
  now = Date.now(),
): string | null {
  if (typeof html !== "string" || html.length === 0 || html.length > 384 * 1024 ||
      typeof articleUrl !== "string" || articleUrl.length > 1600 ||
      typeof feedTitle !== "string" || feedTitle.length < 12 ||
      !Number.isFinite(now)) return null;
  let path: string;
  try {
    const u = new URL(articleUrl);
    if (u.protocol !== "https:" || u.hostname !== "www150.statcan.gc.ca" ||
        u.username || u.password || u.port || u.hash) return null;
    path = u.pathname;
  } catch { return null; }
  const match = ARTICLE_PATH.exec(path);
  if (!match) return null;
  const day = `20${match[1]}-${match[2]}-${match[3]}`;
  const dayStart = Date.parse(day+"T00:00:00Z");
  if (!Number.isFinite(dayStart) || new Date(dayStart).toISOString().slice(0,10)!==day ||
      dayStart>now || now-dayStart>MAX_AGE_MS) return null;
  // The filename must carry EXACTLY the same publisher-original calendar day.
  const segment = path.split("/").at(-1) ?? "";
  if (!segment.startsWith("dq"+match[1]+match[2]+match[3])) return null;
  const text = visiblePublisherText(html);
  // Only original "Released:", never Date modified / atom updated / cache date.
  const released = /(?:^|\s)Released:\s*(20\d{2}-\d{2}-\d{2})(?!\d)/i.exec(text)?.[1];
  if (released !== day) return null;
  // Defend against pairing an unrelated Daily page with a feed article title.
  const heading = /<h1\b[^>]*>([\s\S]{1,1800}?)<\/h1>/i.exec(html)?.[1];
  const headingText = heading ? visiblePublisherText(heading) : "";
  const hay = new Set(words(headingText));
  const overlap = [...new Set(words(feedTitle))].filter(w=>hay.has(w));
  if (overlap.length < 2) return null;
  return day;
}
