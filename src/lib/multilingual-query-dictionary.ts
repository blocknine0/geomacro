import { COUNTRIES_195 } from "./canonical-country-registry-195";
import type { AgentQueryTopic, AgentQueryIntent } from "./agent-query-plan";

export const MULTILINGUAL_QUERY_DICTIONARY_VERSION =
  "geomacro.multilingual-entity-dictionary.v1" as const;

/** Versioned locale set; Intl.DisplayNames supplies the runtime's CLDR names.
 * Unknown languages remain unsupported, not machine-translated or guessed. */
export const QUERY_DICTIONARY_LOCALES = [
  "en", "bn", "hi", "es", "fr", "de", "pt", "ru", "ar", "zh", "ja", "ko",
  "tr", "id", "sw", "fa", "ur", "ta", "te", "th", "vi", "ms", "it", "nl",
  "pl", "uk",
] as const;

type AliasIndex = Map<string, string | null>;
const normalize = (text: string) => text.normalize("NFKC").toLowerCase()
  .replace(/[\u2019\u02bc\u02bb]/gu, "'").replace(/\s+/gu, " ").trim();

function add(index: AliasIndex, raw: string, id: string): void {
  const alias = normalize(raw);
  if (!alias || alias.length < 2 || alias.length > 100) return;
  if (!index.has(alias)) index.set(alias, id);
  else if (index.get(alias) !== id) index.set(alias, null);
}

const countryIndex: AliasIndex = new Map();
for (const row of COUNTRIES_195) {
  for (const alias of [row.name, ...row.aliases])
    add(countryIndex, alias, row.iso3);
}
const currencyCodes = [
  "USD", "EUR", "GBP", "INR", "BDT", "PKR", "CNY", "JPY", "KRW",
  "RUB", "AED", "SAR", "BRL", "CHF", "AUD", "CAD", "IDR", "TRY",
  "NGN", "ZAR", "MXN", "EGP",
] as const;
const currencyIndex: AliasIndex = new Map();
for (const code of currencyCodes) {
  // Codes which are ordinary English words cannot match generically.
  if (!["TRY"].includes(code)) add(currencyIndex, code, code);
}
add(countryIndex, "Congo", "AMBIGUOUS_COUNTRY_NAME");
// Qualified Congo names must use a full explicit alias (DR Congo / Congo-Brazzaville).
countryIndex.set("congo", null);
for (const locale of QUERY_DICTIONARY_LOCALES) {
  try {
    const regions = new Intl.DisplayNames([locale], { type: "region" });
    const currencies = new Intl.DisplayNames([locale], { type: "currency" });
    for (const row of COUNTRIES_195) {
      const translated = regions.of(row.iso2);
      if (translated && translated !== row.iso2) add(countryIndex, translated, row.iso3);
    }
    for (const code of currencyCodes) {
      const translated = currencies.of(code);
      if (translated && translated !== code) add(currencyIndex, translated, code);
    }
  } catch {
    // Limited-ICU runtimes safely retain the curated English/ISO aliases.
  }
}

/** Curated, unambiguous domain terms. A language not listed here must be
 * handled by an explicit topic input or future reviewed dictionary release. */
const topicWords: Partial<Record<AgentQueryTopic, readonly string[]>> = {
  macro_risk: [
    "মুদ্রাস্ফীতি", "জিডিপি", "অর্থনৈতিক প্রবৃদ্ধি",
    "मुद्रास्फीति", "सकल घरेलू उत्पाद", "महंगाई",
    "inflación", "producto interno bruto", "inflation", "inflazione",
    "инфляция", "валовой внутренний продукт", "التضخم", "الناتج المحلي الإجمالي",
    "通货膨胀", "通脹", "国内生产总值", "国内総生産", "インフレ", "물가상승률",
    "enflasyon", "تورم", "lạm phát", "เงินเฟ้อ",
  ],
  fx_external_risk: [
    "বৈদেশিক মুদ্রা", "বিনিময় হার", "विदेशी मुद्रा", "विनिमय दर",
    "tipo de cambio", "taux de change", "wechselkurs", "taxa de câmbio",
    "обменный курс", "валютный курс", "سعر الصرف", "العملات الأجنبية",
    "汇率", "匯率", "為替レート", "환율", "döviz kuru",
  ],
  critical_minerals: [
    "বিরল মৃত্তিকা", "লিথিয়াম", "কোবাল্ট", "दुर्लभ मृदा", "लिथियम",
    "tierras raras", "minerales críticos", "terres rares", "kritische mineralien",
    "редкоземельные металлы", "литий", "المعادن الحرجة", "العناصر الأرضية النادرة",
    "稀土", "锂", "稀土類", "リチウム", "희토류", "리튬",
  ],
  energy_commodities: [
    "সোনা", "স্বর্ণ", "রূপা", "তেল", "सोना", "चाँदी", "कच्चा तेल",
    "oro", "plata", "petróleo", "gaz naturel", "золото", "серебро",
    "нефть", "ذهب", "فضة", "نفط", "黄金", "白银", "原油",
    "金価格", "銀価格", "금값", "gümüş",
  ],
  trade_corridor: [
    "বাণিজ্য পথ", "বাণিজ্য করিডর", "व्यापार गलियारा", "व्यापार मार्ग",
    "corredor comercial", "ruta comercial", "corridor commercial",
    "торговый коридор", "торговый маршрут", "الممر التجاري",
    "贸易走廊", "貿易走廊", "貿易ルート", "무역 회랑",
  ],
  conflict_geopolitics: [
    "যুদ্ধ", "ভূরাজনীতি", "युद्ध", "भूराजनीति", "guerra", "géopolitique",
    "война", "геополитика", "حرب", "جيوسياسية",
    "战争", "地缘政治", "戦争", "地政学", "전쟁", "jeopolitik",
  ],
  sovereign_risk: [
    "সরকারি ঋণ", "সার্বভৌম ঋণ", "सरकारी ऋण", "सार्वभौम ऋण",
    "deuda soberana", "dette souveraine", "государственный долг",
    "الديون السيادية", "主权债务", "政府債務", "국가 부채",
  ],
  sanctions_restrictions: [
    "নিষেধাজ্ঞা", "प्रतिबंध", "sanciones económicas", "sanctions économiques",
    "санкции", "العقوبات", "制裁措施", "経済制裁", "경제 제재",
  ],
};
const indicatorIndex: AliasIndex = new Map();
for (const [alias, id] of [
  ["inflation", "INFLATION"], ["মুদ্রাস্ফীতি", "INFLATION"],
  ["मुद्रास्फीति", "INFLATION"], ["inflación", "INFLATION"],
  ["инфляция", "INFLATION"], ["التضخم", "INFLATION"], ["通胀", "INFLATION"],
  ["gdp", "GDP"], ["জিডিপি", "GDP"], ["सकल घरेलू उत्पाद", "GDP"],
  ["producto interno bruto", "GDP"], ["国内生产总值", "GDP"],
  ["unemployment", "UNEMPLOYMENT"], ["বেকারত্ব", "UNEMPLOYMENT"],
  ["बेरोजगारी", "UNEMPLOYMENT"], ["desempleo", "UNEMPLOYMENT"],
  ["безработица", "UNEMPLOYMENT"], ["失业率", "UNEMPLOYMENT"],
] as const) add(indicatorIndex, alias, id);
const commodityIndex: AliasIndex = new Map();
for (const [alias, id] of [
  ["gold", "GOLD"], ["সোনা", "GOLD"], ["স্বর্ণ", "GOLD"],
  ["सोना", "GOLD"], ["oro", "GOLD"], ["золото", "GOLD"], ["ذهب", "GOLD"], ["الذهب", "GOLD"], ["黄金", "GOLD"],
  ["silver", "SILVER"], ["রূপা", "SILVER"], ["রূপার", "SILVER"], ["चाँदी", "SILVER"],
  ["plata", "SILVER"], ["серебро", "SILVER"], ["فضة", "SILVER"], ["白银", "SILVER"],
  ["lithium", "LITHIUM"], ["লিথিয়াম", "LITHIUM"], ["लिथियम", "LITHIUM"],
  ["литий", "LITHIUM"], ["锂", "LITHIUM"],
  ["crude oil", "CRUDE_OIL"], ["কাঁচা তেল", "CRUDE_OIL"], ["原油", "CRUDE_OIL"],
] as const) add(commodityIndex, alias, id);

/**
 * Only match a complete lexical token for spaced scripts. CJK scripts can
 * appear without spaces, so the dictionary treats their sequences as tokens.
 * Country/entity aliases are candidates, not a replacement for an explicitly
 * validated ISO3 subject in a paid plan.
 */
function matchingSpans(question: string, term: string): Array<{ start: number; end: number }> {
  const spans: Array<{ start: number; end: number }> = [];
  let start = question.indexOf(term);
  const cjk = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(term);
  while (start !== -1) {
    const end = start + term.length;
    if (cjk || (!/[\p{L}\p{N}]/u.test(question[start - 1] ?? "") &&
      !/[\p{L}\p{N}]/u.test(question[end] ?? ""))) spans.push({ start, end });
    start = question.indexOf(term, start + 1);
  }
  return spans;
}

function hasToken(question: string, term: string): boolean {
  return matchingSpans(question, term).length > 0;
}

function matches(question: string, index: AliasIndex): string[] {
  const candidates: Array<{ id: string; start: number; end: number }> = [];
  for (const [alias, id] of index) {
    // A shared alias maps to null and must never select a random entity.
    if (!id) continue;
    for (const span of matchingSpans(question, alias)) candidates.push({ ...span, id });
  }
  // Match longest-first so "Guinea-Bissau" cannot also qualify "Guinea",
  // nor "South Sudan" separately qualify "Sudan".
  candidates.sort((a, b) =>
    (b.end - b.start) - (a.end - a.start) || a.start - b.start || a.id.localeCompare(b.id));
  const accepted: Array<{ start: number; end: number }> = [];
  const ids = new Set<string>();
  for (const candidate of candidates) {
    if (accepted.some(span => candidate.start < span.end && candidate.end > span.start)) continue;
    accepted.push(candidate);
    ids.add(candidate.id);
  }
  return [...ids].sort();
}

export function resolveMultilingualQueryVocabulary(raw: string) {
  if (typeof raw !== "string" || raw.length > 2_000) throw Error("MULTILINGUAL_QUERY_LENGTH_INVALID");
  const question = normalize(raw);
  // Shared short aliases are not safe subject extraction.
  // ISO3 country codes remain accepted only in explicit validated subject fields.
  const currencies = matches(question, currencyIndex);
  const commodities = matches(question, commodityIndex);
  const indicators = matches(question, indicatorIndex);
  const topics = new Set<AgentQueryTopic>();
  for (const [topic, aliases] of Object.entries(topicWords) as Array<[AgentQueryTopic, readonly string[]]>) {
    if (aliases.some(alias => hasToken(question, normalize(alias)))) topics.add(topic);
  }
  if (currencies.length) topics.add("fx_external_risk");
  if (indicators.length) topics.add("macro_risk");
  if (commodities.includes("LITHIUM")) topics.add("critical_minerals");
  if (commodities.some(item => ["GOLD", "SILVER", "CRUDE_OIL"].includes(item))) topics.add("energy_commodities");
  const intentTerms: Array<[AgentQueryIntent, readonly string[]]> = [
    ["comparison", ["তুলনা", "तुलना", "comparar", "comparer", "сравнить", "مقارنة", "比较", "比較", "비교"]],
    ["ranking_filter", ["ক্রমতালিকা", "रैंकिंग", "clasificación", "classement", "рейтинг", "ترتيب", "排名", "順位", "순위"]],
    ["change_since", ["পরিবর্তন হয়েছে", "कब से बदला", "qué cambió", "что изменилось", "ما الذي تغير", "发生了什么变化", "何が変わった"]],
  ];
  const intents = intentTerms.filter(([, aliases]) => aliases.some(alias => hasToken(question, normalize(alias))))
    .map(([intent]) => intent);
  return {
    dictionary_version: MULTILINGUAL_QUERY_DICTIONARY_VERSION,
    countries: matches(question, countryIndex),
    currencies, commodities, indicators,
    topics: [...topics].sort(),
    intents: [...new Set(intents)].sort(),
  };
}
