import { createHash } from "node:crypto";

export const CHINA_MOFCOM_URL = "https://exportcontrol.mofcom.gov.cn/";
export const CHINA_MOFCOM_ENGLISH_URL = "https://english.mofcom.gov.cn/Policies/index.html";

function extractTextFragment(value) {
  const input = String(value ?? "");
  let output = "";
  let inTag = false;
  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];
    if (!inTag && char === "<") {
      inTag = true;
      continue;
    }
    if (inTag) {
      if (char === ">") inTag = false;
      continue;
    }
    output += char;
  }
  return output.replace(/\s+/g, " ").trim();
}
function absoluteUrl(href, baseUrl = CHINA_MOFCOM_URL) {
  try { return new URL(href, baseUrl).toString(); } catch { return null; }
}

function dateFromText(value) {
  const text = String(value ?? "");
  const m = text.match(/(?:20\d{2})[./-](?:0?[1-9]|1[0-2])[./-](?:0?[1-9]|[12]\d|3[01])/);
  if (!m) return null;
  const normalized = m[0].replace(/[./]/g, "-");
  const date = new Date(normalized + "T00:00:00.000Z");
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function parseMofcomExportControlHtml(html, { observedAt = new Date().toISOString(), baseUrl = CHINA_MOFCOM_URL } = {}) {
  const input = String(html ?? "");
  if (!/exportcontrol\.mofcom\.gov\.cn/i.test(input) && !/export control/i.test(input)) {
    throw new Error("MOFCOM export-control page marker not found");
  }

  const records = [];
  const anchorRe = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  for (const match of input.matchAll(anchorRe)) {
    const title = extractTextFragment(match[2]);
    const url = absoluteUrl(match[1], baseUrl);
    if (!title || !url || title.length < 6) continue;
    const contextStart = Math.max(0, match.index - 500);
    const contextEnd = Math.min(input.length, match.index + match[0].length + 500);
    const context = extractTextFragment(input.slice(contextStart, contextEnd));
    if (!/export|control|rare earth|dual-use|strategic mineral|mineral|出口管制|战略矿产|稀土|钨|碲|锂/i.test(title + " " + context)) continue;

    const id = match[1].match(/(?:id|article|content|info)[=_/-]([A-Za-z0-9_-]+)/i)?.[1]
      ?? Buffer.from(url).toString("base64url").slice(0, 24);
    const issuedAt = dateFromText(context);
    records.push(normalizeMofcomExportControl({
      id,
      title,
      issuedAt,
      url,
      commodity: /rare earth|稀土/i.test(title + " " + context) ? "Rare earths" : /tungsten|钨/i.test(title + " " + context) ? "Tungsten" : /lithium|锂/i.test(title + " " + context) ? "Lithium" : null,
      retrievedAt: observedAt,
      raw: { title, url, issuedAt, context }
    }));
  }

  const unique = [...new Map(records.map((record) => [record.source_record_id, record])).values()];
  if (!unique.length) throw new Error("MOFCOM parser found no export-control records");
  return unique;
}

export function normalizeMofcomExportControl({ id, title, issuedAt = null, url = CHINA_MOFCOM_URL, commodity = null, controlAction = "EXPORT_CONTROL", retrievedAt = new Date().toISOString(), raw = null }) {
  if (!title) throw new Error("MOFCOM record requires title");
  const key = String(id ?? title).trim().replace(/\s+/g, "_");
  const rawPayload = raw ?? { id, title, issuedAt, commodity, controlAction, url };
  return {
    source_id:"china_mofcom_trade_controls",
    source_record_id:"MOFCOM:" + key,
    category:"CRITICAL_MINERALS",
    country_iso3:"CHN",
    observed_at:retrievedAt,
    published_at:issuedAt ? new Date(issuedAt).toISOString() : retrievedAt,
    title:"China trade control: " + title,
    summary:"China Ministry of Commerce trade/export-control notice.",
    source_url:url,
    metric:"trade_control_action",
    value_numeric:1,
    value_text:controlAction,
    unit:"policy action",
    commodity,
    event_type:"EXPORT_CONTROL",
    signal_type:"CRITICAL_MINERALS_TRADE_CONTROL",
    provenance:{provider:"Ministry of Commerce of the People's Republic of China",dataset:"MOFCOM Policies / Announcements",id:String(id ?? ""),commodity:String(commodity ?? "")},
    raw_payload:rawPayload,
    raw_hash:createHash("sha256").update(JSON.stringify(rawPayload)).digest("hex")
  };
}
