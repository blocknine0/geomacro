import { publicCapabilityPricingCatalog } from "./capability-pricing-catalog.ts";
import { GEOMACRO_STORE_REQUEST_EXAMPLES } from "./store-product-examples.ts";
import { normalizeReusableNewsJson, type ReusableNewsInput } from "./reusable-news-json.ts";
import { country195ByIso3 } from "./canonical-country-registry-195.ts";

export const NEWS_PRODUCT_FACTORY_VERSION = "geomacro.news-product-factory.v1" as const;
type News = ReturnType<typeof normalizeReusableNewsJson>;
const eventTopics: Record<string, string> = {
  sanctions: "sovereign_risk",
  export_restriction: "critical_minerals",
  interest_rate_change: "macro_risk",
  inflation: "macro_risk",
  trade_policy: "fx_external_risk",
  mineral_supply: "critical_minerals",
  security: "conflict_geopolitics",
  monetary_policy: "macro_risk",
  investment: "macro_risk",
};
const channels: Record<string, readonly string[]> = {
  macro: ["monetary_conditions", "currency_exposure", "funding_costs"],
  geopolitics: ["policy_restrictions", "cross_border_exposure", "supply_continuity"],
  rare_earth: ["mineral_availability", "processing_capacity", "import_dependency"],
};
const stable = (value: unknown): string =>
  value === null || typeof value !== "object"
    ? JSON.stringify(value)
    : Array.isArray(value)
      ? "[" + value.map(stable).join(",") + "]"
      : "{" +
        Object.entries(value as Record<string, unknown>)
          .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
          .map(([k, v]) => JSON.stringify(k) + ":" + stable(v))
          .join(",") +
        "}";
async function hash(value: unknown) {
  return Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(stable(value)))),
    (b) => b.toString(16).padStart(2, "0"),
  ).join("");
}

/** Bounded source-free product drafts, not invented risk scores or verified
 * multi-source evidence. The canonical ingestion validator runs before this
 * function in the Worker. This function also validates independent callers. */
export async function buildNewsProductPacket(
  news: News,
  options: {
    destination_country_iso3?: string;
    now?: number;
  } = {},
) {
  const now = options.now ?? Date.now();
  if (
    !Number.isFinite(now) ||
    !news ||
    news.schema !== "geomacro.reusable-news-json.v1" ||
    typeof news.id !== "string" ||
    !/^news-[a-f0-9]{16}(?:[a-f0-9]{48})?$/.test(news.id) ||
    !Object.hasOwn(channels, news.category) ||
    !news.facts ||
    !Array.isArray(news.facts.event_types) ||
    !Array.isArray(news.facts.numeric_mentions) ||
    !["MACHINE_EXTRACTED_UNVERIFIED", "INSUFFICIENT_MACHINE_EXTRACTABLE_FACTS"].includes(
      news.facts.fact_extraction_status,
    ) ||
    news.facts.numeric_mentions.length > 15 ||
    news.facts.event_types.length > 12 ||
    !Array.isArray(news.facts.action_terms) ||
    news.facts.action_terms.length > 12 ||
    !Array.isArray(news.facts.named_organizations) ||
    news.facts.named_organizations.length > 12 ||
    news.delivery?.raw_article_included !== false ||
    news.delivery?.raw_headline_included !== false ||
    news.usage_rights?.commercial_reuse_authorized !== false ||
    news.verification?.facts_reviewed !== false
  )
    throw Error("NEWS_FACTORY_INPUT_INVALID");
  const at = news.source?.original_published_at;
  if (typeof at !== "string") throw Error("NEWS_FACTORY_NATIVE_CLOCK_INVALID");
  const clock = Date.parse(at);
  if (!Number.isFinite(clock) || clock > now || now - clock > 25 * 3600_000)
    throw Error("NEWS_FACTORY_NATIVE_CLOCK_INVALID");
  const country = news.country_iso3;
  if (country !== null && !country195ByIso3(country as string))
    throw Error("NEWS_FACTORY_COUNTRY_INVALID");
  const destination = options.destination_country_iso3 ?? null;
  if (destination && (!country || !country195ByIso3(destination) || destination === country))
    throw Error("NEWS_FACTORY_CORRIDOR_INVALID");
  for (const values of [
    news.facts.event_types,
    news.facts.action_terms,
    news.facts.named_organizations,
  ])
    if (values.some((x) => typeof x !== "string" || !/^[a-zA-Z0-9_ ./-]{1,72}$/u.test(x)))
      throw Error("NEWS_FACTORY_FACT_INVALID");
  const mentions = news.facts.numeric_mentions.map((m) => {
    if (
      !m ||
      !/^\d{1,9}(?:\.\d{1,4})?$/.test(m.value) ||
      !/^[a-zA-Z% ]{0,24}$/u.test(m.unit) ||
      ![null, "million", "billion", "trillion"].includes(m.scale)
    )
      throw Error("NEWS_FACTORY_METRIC_INVALID");
    return {
      value: m.value,
      unit: m.unit,
      scale: m.scale,
      relationship: "UNBOUND_SOURCE_MENTION" as const,
    };
  });
  const topics = [
    ...new Set(news.facts.event_types.map((tag) => eventTopics[tag]).filter(Boolean)),
  ].sort();
  const primary =
    topics[0] ??
    { macro: "macro_risk", geopolitics: "conflict_geopolitics", rare_earth: "critical_minerals" }[
      news.category
    ];
  const contextTopic = primary === "macro_risk" ? "fx_external_risk" : "macro_risk";
  const contextTopics = [...new Set([primary, contextTopic])];
  const prices = publicCapabilityPricingCatalog();
  const facts = {
    event_types: [...news.facts.event_types].sort(),
    actions: [...news.facts.action_terms].sort(),
    organizations: [...news.facts.named_organizations].sort(),
    numeric_mentions: mentions,
    publication_time: at,
    country_iso3: country,
    extraction_status: news.facts.fact_extraction_status,
    independent_evidence_count: null,
    verified_current_value: null,
    verified_previous_value: null,
    verified_delta: null,
  };
  const analysis = {
    possible_transmission_channels: channels[news.category],
    transmission_is_scenario_not_observed_impact: true,
    watch_for: [
      "original_release_or_correction",
      "qualified_baseline_comparison",
      "independent_confirmation",
    ],
    unknowns: [
      "numeric_subject_and_time_binding",
      "independent_confirmation",
      "measured_impact",
      "commercial_admission",
    ],
    no_forecast_or_risk_score_inferred: true,
  };
  const products = Object.entries(GEOMACRO_STORE_REQUEST_EXAMPLES).map(([id, example]) => {
    const request: Record<string, unknown> = JSON.parse(JSON.stringify(example));
    const corridor = example.product.capability.includes("corridor");
    request.subjects = corridor
      ? [{ type: "corridor", origin_country_iso3: country, destination_country_iso3: destination }]
      : [{ type: "country", country_iso3: country }];
    if (id.includes("digest")) request.topics = [primary];
    else if (id.includes("profile")) request.topics = contextTopics;
    else if (id === "query_focused") request.topics = [primary];
    else if (id === "query_standard" || id === "query_complex") request.topics = contextTopics;
    else if (id === "gate_standard" || id === "gate_complex")
      request.topics = ["risk_gate", "risk_object", ...contextTopics];
    // An issuance cutoff is a buyer-time constraint, never automated proof.
    if (id === "signed_new") delete (request.product as Record<string, unknown>).issued_after;
    const price = prices
      .find((p) => p.capability === example.product.capability)!
      .variants.find((p) => p.variant === example.product.variant)!;
    const blocked = !country
      ? "COUNTRY_SCOPE_REQUIRED"
      : corridor && !destination
        ? "DIRECTIONAL_CORRIDOR_SCOPE_REQUIRED"
        : id === "signed_new"
          ? "RECENT_ISSUANCE_CUTOFF_REQUIRED"
          : "CANONICAL_QUALIFICATION_REQUIRED";
    const data = id.includes("digest")
      ? { event_types: facts.event_types, publication_time: at, category: news.category }
      : id.includes("profile")
        ? { facts, analysis, context_required: contextTopics }
        : id.startsWith("query_")
          ? { facts, ...(id !== "query_focused" ? { analysis } : {}), topics: contextTopics }
          : id.startsWith("signed_")
            ? { evidence_reference: news.id, signature: null, risk: null }
            : {
                evidence_reference: news.id,
                policy_evaluation: null,
                signed_object_included_in_price: true,
              };
    return {
      id,
      capability: price.capability,
      variant: price.variant,
      price_usdc: price.amount_usdc,
      amount_atomic: price.amount_atomic,
      status: blocked,
      draft: data,
      canonical_request: country && (!corridor || destination) ? request : null,
      request_time_fields: id === "signed_new" ? ["product.issued_after"] : [],
      purchase_endpoint: "/api/v1/intelligence/query",
      ready_for_paid_delivery: false,
    };
  });
  const content = {
    schema: NEWS_PRODUCT_FACTORY_VERSION,
    input_id: news.id,
    category: news.category,
    country_iso3: country,
    destination_country_iso3: destination,
    original_published_at: at,
    facts,
    analysis,
    products,
    unique_input_count: 1,
    variant_count: products.length,
    raw_source_material_included: false,
    commercial_admission_inferred: false,
    execution_authorized: false,
  };
  return { ...content, packet_sha256: await hash(content) };
}
export async function newsToProductPacket(
  input: ReusableNewsInput,
  options: Parameters<typeof buildNewsProductPacket>[1] = {},
) {
  return buildNewsProductPacket(normalizeReusableNewsJson(input), options);
}
export type NewsProductPacket = Awaited<ReturnType<typeof buildNewsProductPacket>>;
