export const DIRECT_CORRIDOR_OFFICIAL_HTML_PORTALS = Object.freeze([
  {
    "id": "fra_banque_france_news",
    "url": "https://www.banque-france.fr/fr/actualites-et-evenements",
    "categories": [
      "macro"
    ],
    "format": "html_portal",
    "channel": "CORRIDOR_ONLY",
    "event_verified": false,
    "commercial_eligible": false
  },
  {
    "id": "tha_bot_home",
    "url": "https://www.bot.or.th/en/home.html",
    "categories": [
      "macro"
    ],
    "format": "html_portal",
    "channel": "CORRIDOR_ONLY",
    "event_verified": false,
    "commercial_eligible": false
  },
  {
    "id": "nyfed_gscpi",
    "url": "https://www.newyorkfed.org/research/policy/gscpi",
    "categories": [
      "macro"
    ],
    "format": "html_portal",
    "channel": "CORRIDOR_ONLY",
    "event_verified": false,
    "commercial_eligible": false
  },
  {
    "id": "chn_gov_cn_en",
    "url": "https://english.www.gov.cn/",
    "categories": [
      "geopolitics",
      "macro"
    ],
    "format": "html_portal",
    "channel": "CORRIDOR_ONLY",
    "event_verified": false,
    "commercial_eligible": false
  },
  {
    "id": "nga_statehouse",
    "url": "https://statehouse.gov.ng/",
    "categories": [
      "geopolitics",
      "macro"
    ],
    "format": "html_portal",
    "channel": "CORRIDOR_ONLY",
    "event_verified": false,
    "commercial_eligible": false
  },
  {
    "id": "uneca_official_stories",
    "url": "https://www.uneca.org/stories",
    "categories": [
      "geopolitics",
      "macro"
    ],
    "format": "html_portal",
    "channel": "CORRIDOR_ONLY",
    "event_verified": false,
    "commercial_eligible": false
  }
]);

const MAX_HTML_BYTES = 512_000;
const DATE_RE = /\b(202[56]-[01]\d-[0-3]\d|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},\s+202[56])\b/i;

export function extractOfficialPortalMetadata({ html, source, limit = 10 }) {
  const u = new URL(source.url);
  if (u.protocol !== "https:" || u.search || u.hash) throw Error("PORTAL_URL_INVALID");
  const out = [];
  const seen = new Set();
  const re = /<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html)) && out.length < limit) {
    const rawHref = m[1].trim();
    const title = m[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    if (title.length < 18 || title.length > 220) continue;
    let abs;
    try { abs = new URL(rawHref, u.origin); } catch { continue; }
    if (abs.hostname !== u.hostname || abs.protocol !== "https:" || seen.has(abs.href)) continue;
    const windowText = html.slice(Math.max(0, m.index - 250), Math.min(html.length, m.index + m[0].length + 250));
    const dateMatch = windowText.match(DATE_RE);
    if (!dateMatch) continue;
    seen.add(abs.href);
    out.push({
      source_id: source.id,
      title,
      url: abs.href,
      published_at_raw: dateMatch[1],
      categories: source.categories,
      channel: "CORRIDOR_ONLY",
      event_verified: false,
      commercial_eligible: false,
    });
  }
  return out;
}

export async function fetchOfficialPortalMetadata(source, { fetchImpl = fetch } = {}) {
  const u = new URL(source.url);
  if (u.protocol !== "https:" || u.search || u.hash) throw Error("PORTAL_URL_INVALID");
  const res = await fetchImpl(u.href, {
    redirect: "manual",
    headers: { "user-agent": "GeoMacroCorridorObserver/1.0 (+https://geomacro.live)" },
  });
  if (res.status !== 200) return { source_id: source.id, status: "HTTP_" + res.status, items: [] };
  const html = (await res.text()).slice(0, MAX_HTML_BYTES);
  if (/cloudflare|attention required|just a moment/iu.test(html)) {
    return { source_id: source.id, status: "TRANSPORT_BLOCKED", items: [] };
  }
  return { source_id: source.id, status: "OK", items: extractOfficialPortalMetadata({ html, source }) };
}
