import { createHash } from "node:crypto";

const ECB_HOSTS = new Set(["www.ecb.europa.eu", "ecb.europa.eu"]);

function decodeXml(value) {
  return String(value ?? "")
    .replace(/^<!\[CDATA\[([\s\S]*)\]\]>$/i, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .trim();
}

function tag(block, name) {
  const match = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, "i").exec(block);
  return match ? decodeXml(match[1]) : "";
}

function safeEcbUrl(value) {
  const url = new URL(value);
  if (url.protocol !== "https:" || !ECB_HOSTS.has(url.hostname.toLowerCase())) {
    throw new Error(`ECB RSS item has unexpected URL: ${value}`);
  }
  return url.toString();
}

function isoDate(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error(`Invalid ECB RSS pubDate: ${value}`);
  return date.toISOString();
}

export function classifyEcbTitle(title) {
  const text = String(title ?? "").toLowerCase();

  const monetary = [
    "monetary policy",
    "interest rate",
    "key ecb interest rates",
    "governing council",
    "deposit facility",
    "main refinancing",
  ];
  if (monetary.some((needle) => text.includes(needle))) return "monetary_policy";

  const liquidity = [
    "liquidity",
    "refinancing operation",
    "open market operation",
    "collateral",
    "minimum reserves",
  ];
  if (liquidity.some((needle) => text.includes(needle))) return "banking_liquidity";

  const regulatory = [
    "banking supervision",
    "supervisory",
    "capital requirement",
    "macroprudential",
    "financial stability",
  ];
  if (regulatory.some((needle) => text.includes(needle))) return "regulatory_policy";

  return "other";
}

export function parseEcbPressRss(xml) {
  const text = String(xml ?? "").trim();
  if (!text || !/<rss\b/i.test(text) || !/<channel\b/i.test(text)) {
    throw new Error("ECB RSS payload is not a valid RSS channel");
  }

  const blocks = [...text.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)].map((match) => match[1]);
  if (blocks.length === 0) throw new Error("ECB RSS payload contains no items");
  if (blocks.length > 500) throw new Error(`ECB RSS payload unexpectedly large: ${blocks.length} items`);

  const items = blocks.map((block) => {
    const title = tag(block, "title");
    const link = safeEcbUrl(tag(block, "link"));
    const publishedAt = isoDate(tag(block, "pubDate"));
    const guid = tag(block, "guid") || link;
    if (!title || title.length > 500) throw new Error("ECB RSS item title is missing or too long");
    if (!guid || guid.length > 1000) throw new Error("ECB RSS item guid is missing or too long");

    const itemId = createHash("sha256")
      .update(`${guid}\n${publishedAt}\n${title}`, "utf8")
      .digest("hex");

    return {
      source_id: "ecb_press_rss",
      source_record_id: itemId,
      title,
      url: link,
      published_at_utc: publishedAt,
      event_family_candidate: classifyEcbTitle(title),
      source_scope: "EURO_AREA",
      source_timezone: "Europe/Brussels",
      raw_body_stored: false,
    };
  });

  const duplicateIds = items
    .map((item) => item.source_record_id)
    .filter((id, index, all) => all.indexOf(id) !== index);
  if (duplicateIds.length) throw new Error("ECB RSS payload produced duplicate normalized item IDs");

  return items;
}
