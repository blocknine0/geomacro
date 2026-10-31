/** ECB official daily euro reference rates. They are NOT streaming FX quotes.
 * Publisher date is retained exactly; no invented intraday timestamp.
 */
export const ECB_DAILY_FX_URL =
  "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml";
const CURRENCIES = ["USD", "GBP", "JPY"] as const;

export function parseEcbDailyFxReference(xml, now = Date.now()) {
  if (typeof xml !== "string" || xml.length > 96_000 ||
      /<!DOCTYPE|<!ENTITY|<script/i.test(xml) || !/<(?:gesmes:)?Envelope\b/i.test(xml)) {
    throw Error("ECB_FX_XML_INVALID");
  }
  const match = /<Cube\s+time=['"](\d{4}-\d{2}-\d{2})['"]\s*>/i.exec(xml);
  if (!match || new Date(Date.parse(match[1])).toISOString().slice(0, 10) !== match[1]) {
    throw Error("ECB_FX_REFERENCE_DATE_INVALID");
  }
  const timestamp = Date.parse(match[1] + "T00:00:00Z");
  if (!Number.isFinite(timestamp) || timestamp > now ||
      now - timestamp > 8 * 86_400_000) {
    throw Error("ECB_FX_REFERENCE_STALE");
  }
  const values = {};
  for (const [, currency, text] of xml.matchAll(/<Cube\s+currency=['"]([A-Z]{3})['"]\s+rate=['"]([0-9]+(?:\.[0-9]{1,10})?)['"]\s*\/>/g)) {
    if (!CURRENCIES.includes(currency) || Object.hasOwn(values, currency)) continue;
    const rate = Number(text);
    if (Number.isFinite(rate) && rate > 0 && rate < 1_000_000) values[currency] = rate;
  }
  if (!CURRENCIES.every(currency => Number.isFinite(values[currency]))) {
    throw Error("ECB_FX_RATES_INCOMPLETE");
  }
  return {
    provider: "ECB_DAILY_REFERENCE",
    reference_date: match[1],
    base: "EUR",
    rates: CURRENCIES.map(currency => ({
      currency, per_eur: values[currency],
    })),
    intraday_live_verified: false,
    transaction_price: false,
  };
}
