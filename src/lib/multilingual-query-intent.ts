import { z } from "zod";
import { COUNTRIES_195, country195ByIso3 } from "./canonical-country-registry-195";
import {
  AGENT_QUERY_INTENTS, AGENT_QUERY_TOPICS,
  agentAdaptiveQuerySchema, buildAgentQueryPlan,
  type AgentQueryIntent, type AgentQueryTopic,
} from "./agent-query-plan";
import { resolveGeomacroCapabilityPrice } from "./capability-pricing-catalog";
import { storeProductSelectionSchema } from "./store-product-selection";

/**
 * No-funds, deterministic multilingual query intake. This is an adapter to
 * the existing priced agent plan, NOT a parallel evidence or payment engine.
 * Unknown translations, entities, directions or product claims fail closed.
 */
export const MULTILINGUAL_QUERY_SCHEMA = "geomacro.multilingual-query-interpretation.v1";
const LOCALES = [
  "en", "bn", "hi", "ur", "ar", "fa", "es", "fr", "de", "pt", "ru",
  "zh", "ja", "ko", "id", "tr", "sw", "it", "ta",
] as const;
const inputSchema = z.object({
  question: z.string().trim().min(3).max(2000),
  language: z.string().trim().regex(/^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/i).optional(),
  subjects: agentAdaptiveQuerySchema.shape.subjects.optional(),
  topics: z.array(z.enum(AGENT_QUERY_TOPICS)).max(16).optional(),
  product: storeProductSelectionSchema.optional(),
  ranking: agentAdaptiveQuerySchema.shape.ranking.optional(),
  change: agentAdaptiveQuerySchema.shape.change.optional(),
  risk_gate_context: agentAdaptiveQuerySchema.shape.risk_gate_context.optional(),
  as_of: agentAdaptiveQuerySchema.shape.as_of.optional(),
  max_age_seconds: agentAdaptiveQuerySchema.shape.max_age_seconds.optional(),
  client_request_id: agentAdaptiveQuerySchema.shape.client_request_id.optional(),
}).strict();

type Subject = z.infer<typeof agentAdaptiveQuerySchema>["subjects"][number];
export type MultilingualQueryInput = z.infer<typeof inputSchema>;
function norm(s: string) {
  return s.normalize("NFKC").toLowerCase().replace(/\s+/gu, " ").trim();
}
function escapeRe(s: string) {
  return s.replace(/[.*+?^$()|[\]{}\\]/g, "\\$&");
}
function hasToken(text: string, term: string) {
  const s = norm(term);
  if (s.length < 2) return false;
  // CJK and abugida inflections do not have reliable ASCII-style word breaks.
  if (!/[a-z]/iu.test(s)) return text.includes(s);
  const pattern = new RegExp("(?<![\\p{L}\\p{M}\\p{N}])" + escapeRe(s) +
    "(?![\\p{L}\\p{M}\\p{N}])", "u");
  return pattern.test(text);
}
function termsMatch(text: string, terms: readonly string[]) {
  return terms.some(term => hasToken(text, term));
}

// Deliberately curated topic words; one ambiguous generic "risk" is NEVER a
// substitute for a qualified semantic dimension. ISO3 subjects work in ANY
// language even where the offline word coverage is incomplete.
const TOPIC_WORDS: Partial<Record<AgentQueryTopic, readonly string[]>> = {
  sovereign_risk: ["sovereign debt", "fiscal deficit", "debt default", "সার্বভৌম ঋণ",
    "সরকারি ঋণ", "राजकोषीय", "सार्वभौम ऋण", "deuda soberana", "dette souveraine",
    "Staatsverschuldung", "государственный долг", "الدين السيادي", "主权债务", "国債"],
  macro_risk: ["inflation", "gdp", "economic growth", "macroeconomic", "interest rates",
    "central bank", "মুদ্রাস্ফীতি", "জিডিপি", "অর্থনীতি", "সুদের হার",
    "मुद्रास्फीति", "महंगाई", "अर्थव्यवस्था", "जीडीपी", "महँगाई",
    "التضخم", "الناتج المحلي", "inflación", "crecimiento económico",
    "croissance économique", "inflation", "wirtschaftswachstum",
    "инфляция", "ввп", "经济增长", "通货膨胀", "インフレ", "경제 성장", "enflasyon",
    "inflação", "பணவீக்கம்", "بڑھتی قیمتیں"],
  fx_external_risk: ["foreign exchange", "fx reserve", "exchange rate", "currency",
    "forex", "বৈদেশিক মুদ্রা", "বিনিময় হার", "রিজার্ভ", "মুদ্রার মান",
    "विदेशी मुद्रा", "विनिमय दर", "विदेशी भंडार", "سعر الصرف",
    "احتياطيات النقد", "tipo de cambio", "reservas de divisas",
    "taux de change", "devises", "wechselkurs", "валютный курс",
    "обменный курс", "汇率", "外汇", "為替", "환율", "câmbio", "دَرز مبادلہ"],
  sanctions_restrictions: ["sanction", "sanctions", "embargo", "export restrictions",
    "নিষেধাজ্ঞা", "आर्थिक प्रतिबंध", "प्रतिबंध", "عقوبات", "حظر",
    "sanciones", "embargo", "sanctions", "sanktionen", "санкции",
    "制裁", "制裁措置", "제재", "sanções"],
  conflict_geopolitics: ["war", "military conflict", "geopolitical", "armed conflict",
    "যুদ্ধ", "সংঘাত", "ভূরাজনীতি", "युद्ध", "भूराजनीति", "الحرب",
    "نزاع", "guerra", "geopolítica", "conflit", "guerre",
    "krieg", "геополитика", "война", "战争", "地缘政治", "戦争", "전쟁"],
  trade_corridor: ["trade", "tariff", "shipping route", "supply chain",
    "বাণিজ্য", "শুল্ক", "সরবরাহ শৃঙ্খল", "व्यापार", "आपूर्ति श्रृंखला",
    "comercio", "aranceles", "commerce", "droits de douane", "handel",
    "торговля", "التجارة", "关税", "贸易", "貿易", "무역", "comércio"],
  energy_commodities: ["crude oil", "natural gas", "energy prices", "petroleum",
    "জ্বালানি", "অপরিশোধিত তেল", "প্রাকৃতিক গ্যাস", "कच्चा तेल", "प्राकृतिक गैस",
    "النفط", "الغاز", "petróleo", "gas natural", "énergie", "erdgas",
    "нефть", "原油", "天然气", "石油", "天然ガス", "원유"],
  critical_minerals: ["critical minerals", "rare earth", "lithium", "cobalt", "nickel",
    "copper", "graphite", "খনিজ", "লিথিয়াম", "তামা", "কোবাল্ট",
    "महत्वपूर्ण खनिज", "लिथियम", "तांबा", "المعادن الحرجة", "الليثيوم",
    "minerales críticos", "litio", "minerais critiques", "terres rares",
    "kritische mineralien", "литий", "редкоземельные", "关键矿产", "稀土",
    "リチウム", "重要鉱物", "핵심 광물", "리튬", "minerais críticos"],
  political_governance: ["election", "governance", "political stability",
    "নির্বাচন", "রাজনৈতিক স্থিতিশীলতা", "चुनाव", "राजनीतिक स्थिरता",
    "الانتخابات", "estabilidad política", "élection", "wahl",
    "выборы", "选举", "選挙", "선거"],
  banking_financial_system: ["bank liquidity", "banking crisis", "financial system",
    "ব্যাংকিং", "ব্যাংক সংকট", "बैंकिंग संकट", "الأزمة المصرفية",
    "crisis bancaria", "crise bancaire", "банковский кризис", "银行危机", "銀行危機", "은행 위기"],
  food_agriculture: ["agriculture", "food security", "crop yield", "wheat",
    "কৃষি", "খাদ্য নিরাপত্তা", "গম", "कृषि", "खाद्य सुरक्षा", "الزراعة",
    "seguridad alimentaria", "agriculture", "landwirtschaft", "сельское хозяйство",
    "农业", "食料安全保障", "식량 안보"],
  natural_hazards: ["earthquake", "flooding", "cyclone", "wildfire",
    "ভূমিকম্প", "বন্যা", "ঘূর্ণিঝড়", "भूकंप", "बाढ़", "زلزال", "فيضانات",
    "terremoto", "inundación", "tremblement de terre", "erdbeben",
    "землетрясение", "地震", "洪水", "地震", "홍수"],
  hot_topics: ["latest news", "breaking news", "current events", "today's news",
    "সর্বশেষ", "আজকের খবর", "এখনকার খবর", "তাজা খবর", "ताजा खबर", "आज की खबर",
    "أحدث الأخبار", "آخر الأخبار", "últimas noticias", "actualidad",
    "dernières nouvelles", "aktuelle nachrichten", "последние новости",
    "最新消息", "最新ニュース", "최신 뉴스", "últimas notícias"],
  risk_object: ["signed risk object", "risk object", "স্বাক্ষরিত ঝুঁকি",
    "हस्ताक्षरित जोखिम", "objeto de riesgo firmado", "objet de risque signé",
    "签名风险对象", "署名済みリスク", "서명된 위험 객체"],
  risk_gate: ["risk gate", "preflight risk policy", "ঝুঁকি যাচাই গেট",
    "जोखिम गेट", "بوابة المخاطر", "puerta de riesgo", "contrôle de risque",
    "风险闸门", "リスクゲート"],
  gri_context: ["global risk index", "gri index", "বৈশ্বিক ঝুঁকি সূচক",
    "वैश्विक जोखिम सूचकांक", "índice de riesgo global", "全球风险指数"],
};
const INTENT_WORDS: Partial<Record<AgentQueryIntent, readonly string[]>> = {
  comparison: ["compare", "comparison", "versus", "vs", "তুলনা", "বনাম",
    "तुलना", "बनाम", "comparar", "comparación", "comparer", "comparaison",
    "vergleichen", "сравнить", "مقارنة", "比较", "比較", "비교", "comparar"],
  ranking_filter: ["rank by risk", "risk ranking", "highest risk", "lowest risk",
    "ঝুঁকির ক্রম", "ঝুঁকির র‍্যাঙ্ক", "जोखिम रैंकिंग", "clasificación de riesgo",
    "classement des risques", "风险排名"],
  change_since: ["changed since", "change since", "previously published", "আগের তুলনায় পরিবর্তন",
    "पिछले प्रकाशित से बदलाव", "cambio desde", "changement depuis",
    "seitdem verändert", "变化以来", "前回からの変化"],
  audit: ["audit trail", "audit", "provenance", "methodology audit", "উৎস যাচাই",
    "অডিট", "ऑडिट", "auditoría", "traçabilité", "prüfen", "аудит", "审计"],
  risk_gate: TOPIC_WORDS.risk_gate,
};
const STRUCTURAL_WORDS = ["digest", "structural digest", "profile", "structural profile",
  "ডাইজেস্ট", "প্রোফাইল", "सारांश", "प्रोफाइल", "résumé structurel",
  "profil", "perfil", "resumen estructural", "结构摘要", "结构概况",
  "ダイジェスト", "プロファイル", "프로필"];
const PROFILE_WORDS = ["profile", "প্রোফাইল", "प्रोफाइल", "profil", "perfil",
  "概况", "プロファイル", "프로필"];
const SIGNED_WORDS = TOPIC_WORDS.risk_object ?? [];
const GATE_WORDS = TOPIC_WORDS.risk_gate ?? [];
const DIRECTION_WORDS = ["to", "→", "->", "থেকে", "से", "तक", "إلى", "الى",
  "hacia", "vers", "nach", "para", "до", "向", "到", "에서", "까지", "から", "へ"];

type Mention = { iso3: string; start: number; end: number };
let aliasCache: Map<string, Set<string>> | null = null;
function countryAliases() {
  if (aliasCache) return aliasCache;
  const result = new Map<string, Set<string>>();
  const nameServices = LOCALES.flatMap(locale => {
    try { return [new Intl.DisplayNames([locale], { type: "region" })]; }
    catch { return []; }
  });
  for (const country of COUNTRIES_195) {
    const names = new Set([country.name, ...country.aliases]);
    for (const service of nameServices) {
      const translated = service.of(country.iso2);
      if (translated && translated !== country.iso2) names.add(translated);
    }
    // Colloquial Bengali/Indic inflections are not supplied by Intl.
    const additions: Record<string,string[]> = {
      IND: ["ভারত", "ভারতের", "ভারতে", "भारत"],
      BGD: ["বাংলাদেশ", "বাংলাদেশের", "বাংলাদেশে", "बांग्लादेश"],
      CHN: ["চীন", "চীনের", "चीन"], USA: ["আমেরিকা", "মার্কিন যুক্তরাষ্ট্র", "अमेरिका"],
      RUS: ["রাশিয়া", "रूस", "России", "Россия"], PAK: ["পাকিস্তান", "পাকিস্তানের", "पाकिस्तान"],
      DEU: ["জার্মানি", "जर्मनी"], GBR: ["ব্রিটেন", "ब्रिटेन"],
      ARE: ["সংযুক্ত আরব আমিরাত"],
    };
    for (const name of additions[country.iso3] ?? []) names.add(name);
    result.set(country.iso3, new Set([...names].map(norm).filter(s => s.length >= 2)));
  }
  aliasCache = result;
  return result;
}
function inferCountries(question: string): Mention[] {
  const normalized = norm(question);
  const all: (Mention & {length:number})[] = [];
  for (const [iso3, aliases] of countryAliases()) {
    for (const alias of aliases) {
      // Repeated occurrences are handled; no partial Latin name matches.
      const regexp = /[a-z]/iu.test(alias)
        ? new RegExp("(?<![\\p{L}\\p{M}\\p{N}])" + escapeRe(alias) +
            "(?![\\p{L}\\p{M}\\p{N}])", "gu")
        : new RegExp(escapeRe(alias), "gu");
      for (const match of normalized.matchAll(regexp)) {
        all.push({ iso3, start: match.index, end: match.index + alias.length, length: alias.length });
      }
    }
  }
  // A long, exact country name beats an embedded subname, e.g. South Korea.
  all.sort((a,b) => b.length - a.length || a.start - b.start);
  const picked: typeof all = [];
  for (const m of all) {
    if (picked.some(p => m.start < p.end && p.start < m.end)) continue;
    picked.push(m);
  }
  return picked.sort((a,b) => a.start - b.start).map(({iso3,start,end}) => ({iso3,start,end}));
}
function iso3LabeledMention(question: string): string | null {
  const match = /\b(?:ISO3|country_iso3)\s*[:=]\s*([A-Z]{3})\b/u.exec(question);
  return match ? (country195ByIso3(match[1])?.iso3 ?? null) : null;
}
function findSubjects(question: string, intent: AgentQueryIntent | null,
  productFamily: "country"|"corridor"|"intelligence"|"signed"|"gate"): Subject[] {
  const mentions = inferCountries(question);
  const labeled = iso3LabeledMention(question);
  if (labeled && !mentions.some(m => m.iso3 === labeled)) {
    mentions.push({ iso3: labeled, start: question.length, end: question.length });
  }
  const unique = [...new Set(mentions.map(m => m.iso3))];
  if (unique.length === 0) throw Error("SUBJECT_REQUIRED_PROVIDE_COUNTRY_ISO3");
  if (unique.length > 25) throw Error("TOO_MANY_COUNTRY_SUBJECTS");
  if (productFamily === "corridor" || (unique.length === 2 &&
      (termsMatch(norm(question), ["corridor", "করিডোর", "गलियारा", "corredor", "couloir", "走廊"]) ||
       /→|->/u.test(question)))) {
    if (mentions.length !== 2 || unique.length !== 2)
      throw Error("DIRECTIONAL_CORRIDOR_REQUIRES_TWO_DISTINCT_ENDPOINTS");
    const between = norm(question).slice(mentions[0].end, mentions[1].start);
    if (!DIRECTION_WORDS.some(word => hasToken(between,word) ||
       (word === "→" && between.includes("→")) ||
       (word === "->" && between.includes("->")) ||
       /^\s*(?:a|à)\s*$/u.test(between)))
      throw Error("CORRIDOR_DIRECTION_UNCLEAR");
    return [{ type: "corridor", origin_country_iso3: mentions[0].iso3,
      destination_country_iso3: mentions[1].iso3 }];
  }
  if (unique.length > 1 && intent !== "comparison" && intent !== "ranking_filter")
    throw Error("MULTIPLE_SUBJECTS_NEED_COMPARISON_OR_DIRECTION");
  return unique.map(country_iso3 => ({ type: "country", country_iso3 }));
}
function detectLanguage(question: string, declared: string | undefined) {
  if (declared) return declared.toLowerCase();
  if (/[\u0980-\u09ff]/u.test(question)) return "bn";
  if (/[\u0900-\u097f]/u.test(question)) return "hi";
  if (/[\u0600-\u06ff]/u.test(question)) return "und-Arab";
  if (/[\u0400-\u04ff]/u.test(question)) return "ru";
  if (/[\u0b80-\u0bff]/u.test(question)) return "ta";
  if (/[\uac00-\ud7af]/u.test(question)) return "ko";
  if (/[\u3040-\u30ff]/u.test(question)) return "ja";
  if (/[\u4e00-\u9fff]/u.test(question)) return "zh";
  return "und";
}
function semanticTopics(question: string): AgentQueryTopic[] {
  const text = norm(question);
  return (Object.entries(TOPIC_WORDS) as [AgentQueryTopic,readonly string[]][])
    .filter(([,terms]) => termsMatch(text,terms))
    .map(([topic]) => topic).sort();
}
function queryIntent(question: string): AgentQueryIntent | null {
  const text = norm(question);
  const found = (Object.entries(INTENT_WORDS) as [AgentQueryIntent,readonly string[]][])
    .filter(([,terms]) => termsMatch(text,terms))
    .map(([intent]) => intent);
  if (found.length > 1) throw Error("AMBIGUOUS_QUERY_INTENT");
  return found[0] ?? null;
}
export function interpretMultilingualIntelligenceQuery(raw: unknown) {
  const input = inputSchema.parse(raw);
  const q = norm(input.question);
  const inferredTopics = semanticTopics(input.question);
  const requestedTopics = input.topics ?? inferredTopics;
  if (input.topics && inferredTopics.some(t => !input.topics!.includes(t)))
    throw Error("EXPLICIT_TOPICS_CONTRADICT_QUESTION");
  if (requestedTopics.length === 0) throw Error("UNSUPPORTED_QUERY_TOPIC_PROVIDE_ENUM");
  const hintedIntent = queryIntent(input.question);
  const inferredFamily: "country"|"corridor"|"intelligence"|"signed"|"gate" =
    termsMatch(q,GATE_WORDS) ? "gate" :
    termsMatch(q,SIGNED_WORDS) ? "signed" :
    termsMatch(q,STRUCTURAL_WORDS)
      ? (termsMatch(q,["corridor","করিডোর","गलियारा","corredor","couloir","走廊"]) ? "corridor" : "country")
      : "intelligence";
  const family = input.product
    ? input.product.capability.startsWith("structural_corridor") ? "corridor"
      : input.product.capability.startsWith("structural_country") ? "country"
      : input.product.capability === "signed_risk_object" ? "signed"
      : input.product.capability === "risk_gate_bundle" ? "gate" : "intelligence"
    : inferredFamily;
  const subjects = input.subjects ?? findSubjects(input.question,hintedIntent,family);
  if (input.subjects) {
    const detected = [...new Set(inferCountries(input.question).map(row => row.iso3))];
    const explicit = new Set(input.subjects.flatMap(subject => subject.type === "country"
      ? [subject.country_iso3.toUpperCase()]
      : [subject.origin_country_iso3.toUpperCase(),subject.destination_country_iso3.toUpperCase()]));
    if (detected.some(iso => !explicit.has(iso)))
      throw Error("EXPLICIT_SUBJECTS_CONTRADICT_QUESTION");
  }
  const isCorridor = subjects.length === 1 && subjects[0].type === "corridor";
  const hintedProfile = termsMatch(q, PROFILE_WORDS);
  const nonSpecial = requestedTopics.filter(t => !["risk_gate","risk_object","gri_context"].includes(t));
  const capability = family === "country"
    ? (hintedProfile ? "structural_country_profile" : "structural_country_digest")
    : family === "corridor"
      ? (hintedProfile ? "structural_corridor_profile" : "structural_corridor_digest")
      : family === "signed" ? "signed_risk_object"
      : family === "gate" ? "risk_gate_bundle" : "intelligence_query";
  let variant = "standard";
  if (capability === "intelligence_query")
    variant = subjects.length > 1 || nonSpecial.length > 3
      ? "complex_multi_source" : nonSpecial.length === 1 ? "focused" : "standard";
  if (capability === "signed_risk_object") variant = "existing_valid_signed";
  if (capability === "risk_gate_bundle")
    variant = requestedTopics.filter(t => t !== "risk_gate" && t !== "risk_object").length > 2
      ? "complex_multi_source" : "existing_proof_preflight";
  const product = input.product ?? { capability, variant };
  if ((family === "country" || family === "corridor") &&
      (requestedTopics.includes("hot_topics") ||
       termsMatch(q,["latest","current","today","breaking","এখন", "সর্বশেষ",
         "ताज़ा", "अभी", "最近", "最新", "actual", "actuel", "сегодня"])))
    throw Error("STRUCTURAL_PRODUCT_CURRENT_NEWS_NOT_SUPPORTED");
  const kind = product.capability;
  if ((kind === "structural_country_digest" || kind === "structural_corridor_digest") &&
      requestedTopics.length !== 1) throw Error("DIGEST_REQUIRES_ONE_DIMENSION");
  if ((kind === "structural_country_profile" || kind === "structural_corridor_profile") &&
      requestedTopics.length < 2) throw Error("PROFILE_REQUIRES_AT_LEAST_TWO_DIMENSIONS");
  if (kind === "intelligence_query" && product.variant === "focused" &&
      nonSpecial.length !== 1) throw Error("FOCUSED_REQUIRES_ONE_SEMANTIC_TOPIC");
  if (kind === "intelligence_query" && product.variant === "standard" &&
      (nonSpecial.length < 1 || nonSpecial.length > 3 || subjects.length !== 1))
    throw Error("STANDARD_REQUIRES_ONE_SUBJECT_UP_TO_THREE_TOPICS");
  if (kind === "risk_gate_bundle" && !input.risk_gate_context)
    throw Error("RISK_GATE_CONTEXT_REQUIRED");
  if (kind === "signed_risk_object" && input.product?.variant === "newly_qualified_signed" &&
      !input.product.issued_after) throw Error("SIGNED_NEW_REQUIRES_ISSUED_AFTER");
  const delivery_tier = kind.startsWith("structural_") ? "structural_baseline"
    : "signed_risk_intelligence";
  const detail = kind.endsWith("_profile") || product.variant === "complex_multi_source"
    ? "full" : kind.endsWith("_digest") || product.variant === "focused"
      ? "compact" : "standard";
  const topics = [...new Set(requestedTopics)].sort() as AgentQueryTopic[];
  // Only explicit caller specs can authorize rankings, changes or action risk.
  const intent: AgentQueryIntent = hintedIntent ??
    (kind === "risk_gate_bundle" ? "risk_gate" :
      isCorridor ? "corridor" : subjects.length > 1 ? "comparison" : "single_subject");
  const canonical = agentAdaptiveQuerySchema.parse({
    question: input.question, subjects, topics, product, intent,
    fulfillment_mode: "published_only", delivery_tier, detail,
    ...(input.ranking ? {ranking:input.ranking} : {}),
    ...(input.change ? {change:input.change} : {}),
    ...(input.risk_gate_context ? {risk_gate_context:input.risk_gate_context} : {}),
    ...(input.as_of ? {as_of:input.as_of} : {}),
    ...(input.max_age_seconds ? {max_age_seconds:input.max_age_seconds} : {}),
    ...(input.client_request_id ? {client_request_id:input.client_request_id} : {}),
  });
  const plan = buildAgentQueryPlan(canonical);
  const price = resolveGeomacroCapabilityPrice(product.capability,product.variant);
  return {
    ok: true as const, schema_version: MULTILINGUAL_QUERY_SCHEMA,
    detected_language: detectLanguage(input.question,input.language),
    language_recognition: "OFFLINE_BOUNDED_LEXICON_WITH_GLOBAL_ISO3_FALLBACK" as const,
    interpretation_review: "DETERMINISTIC_NOT_LIVE_EVIDENCE_PROOF" as const,
    intent: plan.intent, subject_count: plan.subjects.length,
    subjects: plan.subjects, topics: plan.topics, required_modules: plan.required_modules,
    selected_product: {capability:price.capability,variant:price.variant},
    indicative_catalog_price: {amount_usdc:price.amount_usdc,currency:"USDC",
      authoritative_quote:false},
    canonical_request: canonical, query_plan_hash: plan.query_plan_hash,
    next_availability_endpoint: "/api/v1/intelligence/products-availability",
    canonical_purchase_endpoint: "/api/v1/intelligence/query",
    canonical_request_must_be_reused_unchanged: true,
    evidence_checked: false, deliverable: false, payment_required_now:false,
    charged_now:false, execution_authorized:false,
  };
}
