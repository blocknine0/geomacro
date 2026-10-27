import {fetchWithoutRedirect} from "./fetch-without-redirect";
import { country195ByIso3 } from "./canonical-country-registry-195";
import {hasPrivateTelegramSignalReader,readPrivateTelegramSignals} from "./telegram-signals-repository.server";
/**
 * Optional private, per-question research lookup. It never turns a Telegram
 * lead into verified intelligence or an x402 deliverable.
 *
 * The separately governed reader must check publisher permission and Telegram
 * platform rights before reading, and must return counts only (no text/URLs).
 */
import { shouldSeekTelegramLead, type FallbackCategory } from "./on-demand-telegram-lead-decision";

export type TelegramFallbackOutcome = {
  attempted: boolean;
  status: "NOT_NEEDED" | "NOT_CONFIGURED" | "UNAVAILABLE" | "UNVERIFIED_LEADS" | "NO_LEADS";
  searched_channel_count: number;
  unverified_lead_count: number;
  verified_intelligence_created: false;
  chargeable: false;
};

const EMPTY: Pick<TelegramFallbackOutcome,
  "searched_channel_count" | "unverified_lead_count" | "verified_intelligence_created" | "chargeable"
> = { searched_channel_count: 0, unverified_lead_count: 0,
      verified_intelligence_created: false, chargeable: false };

type ReaderReply = {
  schema: "geomacro.private-telegram-query-receipt.v1";
  authorization_checked: true;
  source_text_retained: false;
  commercial_eligible: false;
  searched_channel_count: number;
  unverified_lead_count: number;
};

function isReaderReply(value: unknown): value is ReaderReply {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  const keys = Object.keys(row);
  const expected = ["schema", "authorization_checked", "source_text_retained",
    "commercial_eligible", "searched_channel_count", "unverified_lead_count"];
  return keys.length === expected.length && keys.every(k => expected.includes(k)) &&
    row.schema === "geomacro.private-telegram-query-receipt.v1" &&
    row.authorization_checked === true && row.source_text_retained === false &&
    row.commercial_eligible === false &&
    typeof row.searched_channel_count === "number" && Number.isSafeInteger(row.searched_channel_count) &&
    Number(row.searched_channel_count) >= 1 && Number(row.searched_channel_count) <= 3 &&
    typeof row.unverified_lead_count === "number" && Number.isSafeInteger(row.unverified_lead_count) &&
    Number(row.unverified_lead_count) >= 0 &&
    Number(row.unverified_lead_count) <= Number(row.searched_channel_count) * 20;
}

function trustedReaderConfig(): { url: string; token: string } | null {
  const endpoint = String(process.env.GEOMACRO_PRIVATE_TELEGRAM_READER_URL ?? "").trim();
  const token = String(process.env.GEOMACRO_PRIVATE_TELEGRAM_READER_TOKEN ?? "").trim();
  if (!endpoint || !token) return null;
  try {
    const url = new URL(endpoint);
    if (url.protocol !== "https:" || url.username || url.password ||
        url.search || url.hash || !url.hostname.includes(".") ||
        url.hostname === "localhost" || /^(?:127\.|10\.|192\.168\.|169\.254\.|172\.(?:1[6-9]|2[0-9]|3[01])\.)/.test(url.hostname) ||
        url.pathname !== "/v1/private/telegram/lookup") return null;
    return { url: url.toString(), token };
  } catch {
    return null;
  }
}

export async function lookupTelegramFallback(input: {
  country_iso3: string;
  categories: readonly FallbackCategory[];
  originalArticleEvidenceSufficient: boolean;
}): Promise<TelegramFallbackOutcome> {
  const config = trustedReaderConfig();
  const supabaseReadOnlyAvailable = hasPrivateTelegramSignalReader();
  if (!shouldSeekTelegramLead({ categories: input.categories,
      originalArticleEvidenceSufficient: input.originalArticleEvidenceSufficient,
      authorizedReaderAvailable: Boolean(config) || supabaseReadOnlyAvailable })) {
    return { attempted: false, status: input.originalArticleEvidenceSufficient ||
      input.categories.length === 0 ? "NOT_NEEDED" : "NOT_CONFIGURED", ...EMPTY };
  }
  if ((!config && !supabaseReadOnlyAvailable) || !country195ByIso3(input.country_iso3) ||
      input.categories.length > 3 || new Set(input.categories).size !== input.categories.length ||
      input.categories.some(category => !["geopolitics", "macro", "rare_earth"].includes(category)))
    return { attempted: false, status: "UNAVAILABLE", ...EMPTY };
  try {
    if(supabaseReadOnlyAvailable) {
      // The producer returns private metadata only. No Supabase credentials,
      // writes, billing, risk scoring, or PREDGE integration enter this path.
      const rows=(await Promise.all(input.categories.map(category=>
        readPrivateTelegramSignals({country_iso3:input.country_iso3,category,limit:20})))).flat();
      const distinct=new Set(rows.map(item=>item.signal_id)).size;
      return {attempted:true,status:distinct?"UNVERIFIED_LEADS":"NO_LEADS",
        ...EMPTY,unverified_lead_count:distinct,
        // Source identifiers are intentionally absent from read receipts.
        searched_channel_count:0};
    }
    if(!config)return {attempted:false,status:"NOT_CONFIGURED",...EMPTY};
    const response = await fetchWithoutRedirect(config.url, {
      method: "POST", redirect: "error", cache: "no-store",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${config.token}` },
      body: JSON.stringify({ schema: "geomacro.private-telegram-query.v1",
        country_iso3: input.country_iso3, categories: input.categories,
        max_channels: 3, max_messages_per_channel: 20, max_hours: 6 }),
      signal: AbortSignal.timeout(9000),
    });
    if (!response.ok || response.headers.get("content-type")?.split(";")[0]?.trim() !== "application/json" ||
        Number(response.headers.get("content-length") ?? "0") > 2048)
      return { attempted: true, status: "UNAVAILABLE", ...EMPTY };
    const text = await response.text();
    if (text.length > 2048) return { attempted: true, status: "UNAVAILABLE", ...EMPTY };
    const body: unknown = JSON.parse(text);
    if (!isReaderReply(body)) return { attempted: true, status: "UNAVAILABLE", ...EMPTY };
    return { attempted: true, status: body.unverified_lead_count ?
      "UNVERIFIED_LEADS" : "NO_LEADS", ...EMPTY,
      searched_channel_count: body.searched_channel_count,
      unverified_lead_count: body.unverified_lead_count };
  } catch {
    return { attempted: true, status: "UNAVAILABLE", ...EMPTY };
  }
}
