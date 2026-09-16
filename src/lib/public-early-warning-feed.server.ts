import { createHash } from "node:crypto";

import {
  CEWS_METHOD_VERSION,
  EARLY_WARNING_SCHEMA_VERSION,
  localTimestampFor,
  type EarlyWarningStatus,
  type MarketRelevanceLevel,
} from "./early-warning-contract";
import {
  MARKET_IMPACT_ASSET_CLASSES,
  MARKET_IMPACT_DRIVERS,
  MARKET_IMPACT_METHOD_VERSION,
  type MarketImpactAssessment,
  type MarketImpactDriver,
} from "./early-warning-market-impact";
import { requireRiskSupabase } from "./risk-supabase.server";

export const PUBLIC_EARLY_WARNING_FEED_VERSION =
  "geomacro.public-early-warning-feed.v1" as const;
export const PUBLIC_EARLY_WARNING_POLICY_VERSION =
  "public-alert-policy-v1" as const;

const PUBLIC_STATUSES = new Set<EarlyWarningStatus>(["WARNING", "CRITICAL"]);
const RELEVANCE_LEVELS = new Set<MarketRelevanceLevel>([
  "LOW",
  "MODERATE",
  "HIGH",
  "VERY_HIGH",
  "CRITICAL",
]);
const PRESSURE_DIRECTIONS = new Set(["POSITIVE", "NEGATIVE", "MIXED", "UNCERTAIN"]);
const DIRECTION_SEMANTICS = {
  equities: "broad equity price pressure",
  crypto: "broad crypto risk-asset price pressure",
  fx: "domestic-currency pressure versus major reserve currencies",
  rates: "sovereign yield pressure",
  commodities: "broad relevant-commodity price pressure",
} as const;

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("public early warning row must be an object");
  }
  return value as Record<string, unknown>;
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson(object[key])}`)
    .join(",")}}`;
}

function canonicalSha256(value: unknown) {
  return createHash("sha256").update(stableJson(value), "utf8").digest("hex");
}

function text(value: unknown, field: string, maxLength: number) {
  const normalized = String(value ?? "").trim();
  if (!normalized || normalized.length > maxLength) {
    throw new Error(`${field} is invalid`);
  }
  return normalized;
}

function iso(value: unknown, field: string) {
  const normalized = text(value, field, 80);
  const parsed = new Date(normalized);
  if (!Number.isFinite(parsed.getTime())) throw new Error(`${field} must be ISO time`);
  return parsed.toISOString();
}

function finite(value: unknown, field: string, min: number, max: number) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || number > max) {
    throw new Error(`${field} is out of range`);
  }
  return number;
}

function nonNegativeInteger(value: unknown, field: string) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0) throw new Error(`${field} is invalid`);
  return number;
}

function sha256(value: unknown, field: string) {
  const normalized = text(value, field, 64).toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(normalized)) throw new Error(`${field} must be sha256 hex`);
  return normalized;
}

function stringArray(value: unknown, field: string, maxItems = 30) {
  if (!Array.isArray(value) || value.length > maxItems) throw new Error(`${field} is invalid`);
  const output = value.map((item) => text(item, field, 120));
  if (new Set(output).size !== output.length) throw new Error(`${field} contains duplicates`);
  return output;
}

function boundedRelevance(value: unknown) {
  const source = record(value);
  const output: Record<string, MarketRelevanceLevel> = {};
  for (const [key, raw] of Object.entries(source)) {
    const name = key.trim().toLowerCase();
    if (!/^[a-z][a-z0-9_]{1,39}$/.test(name) || !RELEVANCE_LEVELS.has(raw as MarketRelevanceLevel)) {
      throw new Error("market_relevance contains an invalid entry");
    }
    output[name] = raw as MarketRelevanceLevel;
  }
  return output;
}

function assertExactKeys(value: Record<string, unknown>, expected: readonly string[], field: string) {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) {
    throw new Error(`${field} keys mismatch`);
  }
}

function boundedPublicUrl(value: unknown) {
  if (value == null) return null;
  const normalized = text(value, "public_url", 500);
  let url: URL;
  try {
    url = new URL(normalized);
  } catch {
    throw new Error("public_url must be an absolute URL");
  }
  if (url.protocol !== "https:" || url.hostname !== "geomacro.live") {
    throw new Error("public_url must use the canonical Geomacro origin");
  }
  return url.toString();
}

function boundedMarketImpact(
  value: unknown,
  row: Record<string, unknown>,
  expectedCountryIso3: string,
  expectedConfidence: number,
): MarketImpactAssessment | null {
  if (value == null) {
    if (row.market_impact_methodology_version != null || row.market_impact_hash != null) {
      throw new Error("market impact binding exists without market impact object");
    }
    if (row.market_impact_calibrated !== false) {
      throw new Error("legacy market impact calibrated flag mismatch");
    }
    return null;
  }

  const source = record(value);
  if (source.methodology_version !== MARKET_IMPACT_METHOD_VERSION) {
    throw new Error("market impact methodology mismatch");
  }
  if (row.market_impact_methodology_version !== MARKET_IMPACT_METHOD_VERSION) {
    throw new Error("market impact row methodology binding mismatch");
  }
  if (source.calibrated !== false || row.market_impact_calibrated !== false) {
    throw new Error("market impact must remain uncalibrated");
  }
  if (
    source.structural_pressure_only !== true ||
    source.market_price_prediction !== false ||
    source.trading_instruction !== false ||
    source.public_performance_claims_allowed !== false
  ) {
    throw new Error("market impact safety boundary mismatch");
  }
  const boundHash = sha256(row.market_impact_hash, "market_impact_hash");
  if (canonicalSha256(source) !== boundHash) {
    throw new Error("market impact hash mismatch");
  }

  const driver = text(source.driver, "market_impact.driver", 80) as MarketImpactDriver;
  if (!MARKET_IMPACT_DRIVERS.includes(driver)) {
    throw new Error("market impact driver is not registered");
  }
  const impactCountry = text(source.country_iso3, "market_impact.country_iso3", 3).toUpperCase();
  if (impactCountry !== expectedCountryIso3) {
    throw new Error("market impact country binding mismatch");
  }
  const impactConfidence = finite(source.confidence, "market_impact.confidence", 0, 1);
  if (impactConfidence !== expectedConfidence) {
    throw new Error("market impact confidence binding mismatch");
  }

  const directionSemantics = record(source.direction_semantics);
  assertExactKeys(directionSemantics, MARKET_IMPACT_ASSET_CLASSES, "market impact direction semantics");
  for (const assetClass of MARKET_IMPACT_ASSET_CLASSES) {
    if (directionSemantics[assetClass] !== DIRECTION_SEMANTICS[assetClass]) {
      throw new Error(`market impact ${assetClass} direction semantics mismatch`);
    }
  }

  const assets = record(source.assets);
  assertExactKeys(assets, MARKET_IMPACT_ASSET_CLASSES, "market impact assets");
  const boundedAssets: Record<string, unknown> = {};
  for (const assetClass of MARKET_IMPACT_ASSET_CLASSES) {
    const assessment = record(assets[assetClass]);
    if (!RELEVANCE_LEVELS.has(assessment.relevance as MarketRelevanceLevel)) {
      throw new Error(`market impact ${assetClass} relevance is invalid`);
    }
    if (!PRESSURE_DIRECTIONS.has(String(assessment.pressure_direction))) {
      throw new Error(`market impact ${assetClass} direction is invalid`);
    }
    boundedAssets[assetClass] = {
      relevance: assessment.relevance,
      pressure_direction: assessment.pressure_direction,
      rationale_code: text(assessment.rationale_code, `${assetClass}.rationale_code`, 120),
    };
  }

  return {
    methodology_version: MARKET_IMPACT_METHOD_VERSION,
    calibrated: false,
    structural_pressure_only: true,
    market_price_prediction: false,
    trading_instruction: false,
    public_performance_claims_allowed: false,
    driver,
    country_iso3: impactCountry,
    confidence: impactConfidence,
    transmission_channels: stringArray(source.transmission_channels, "market_impact.transmission_channels", 20),
    direction_semantics: DIRECTION_SEMANTICS,
    assets: boundedAssets as MarketImpactAssessment["assets"],
  };
}

function assertMarketImpactLegacyBindings(input: {
  marketImpact: MarketImpactAssessment | null;
  transmissionChannels: string[];
  marketRelevance: Record<string, MarketRelevanceLevel>;
}) {
  if (!input.marketImpact) return;
  if (JSON.stringify(input.transmissionChannels) !== JSON.stringify(input.marketImpact.transmission_channels)) {
    throw new Error("market impact transmission-channel binding mismatch");
  }
  const keys = Object.keys(input.marketRelevance).sort();
  const expectedKeys = [...MARKET_IMPACT_ASSET_CLASSES].sort();
  if (JSON.stringify(keys) !== JSON.stringify(expectedKeys)) {
    throw new Error("market impact relevance key binding mismatch");
  }
  for (const assetClass of MARKET_IMPACT_ASSET_CLASSES) {
    if (input.marketRelevance[assetClass] !== input.marketImpact.assets[assetClass].relevance) {
      throw new Error(`market impact ${assetClass} relevance binding mismatch`);
    }
  }
}

export function boundedPublicEarlyWarningRow(raw: unknown) {
  const row = record(raw);
  if (row.schema_version !== EARLY_WARNING_SCHEMA_VERSION) throw new Error("early warning schema mismatch");
  if (row.content_type !== "early_warning") throw new Error("early warning content type mismatch");
  if (row.visibility !== "public" || row.public_eligible !== true) {
    throw new Error("early warning row is not public eligible");
  }
  if (row.public_policy_version !== PUBLIC_EARLY_WARNING_POLICY_VERSION) {
    throw new Error("public early warning policy version mismatch");
  }
  if (row.methodology_version !== CEWS_METHOD_VERSION || row.methodology_calibrated !== false) {
    throw new Error("public early warning CEWS methodology boundary mismatch");
  }

  const status = text(row.status, "status", 20) as EarlyWarningStatus;
  if (!PUBLIC_STATUSES.has(status)) throw new Error("public early warning status is not distributable");
  const countryIso3 = text(row.country_iso3, "country_iso3", 3).toUpperCase();
  if (!/^[A-Z]{3}$/.test(countryIso3)) throw new Error("country_iso3 is invalid");
  const countryTimezone = text(row.country_timezone, "country_timezone", 80);
  const confidence = finite(row.confidence, "confidence", 0, 1);
  const publishedAt = iso(row.published_at_utc, "published_at_utc");
  const detectedAt = iso(row.detected_at_utc, "detected_at_utc");
  if (publishedAt < detectedAt) throw new Error("published_at_utc cannot precede detection");
  const canonicalLocalTime = localTimestampFor(detectedAt, countryTimezone);
  if (row.detected_at_local !== canonicalLocalTime) {
    throw new Error("detected_at_local binding mismatch");
  }

  const transmissionChannels = stringArray(row.transmission_channels, "transmission_channels", 20);
  const marketRelevance = boundedRelevance(row.market_relevance);
  const marketImpact = boundedMarketImpact(row.market_impact, row, countryIso3, confidence);
  assertMarketImpactLegacyBindings({ marketImpact, transmissionChannels, marketRelevance });

  return {
    schema_version: EARLY_WARNING_SCHEMA_VERSION,
    alert_key: text(row.alert_key, "alert_key", 200),
    country: {
      iso3: countryIso3,
      name: text(row.country_name, "country_name", 120),
      local_timezone: countryTimezone,
    },
    event: {
      family: text(row.event_family, "event_family", 80),
      title: text(row.event_title, "event_title", 240),
      primary_cause: text(row.primary_cause, "primary_cause", 1000),
    },
    early_warning: {
      status,
      cews_score: finite(row.cews_score, "cews_score", 0, 100),
      confidence,
      independent_evidence_count: nonNegativeInteger(
        row.independent_evidence_count,
        "independent_evidence_count",
      ),
      official_source_present: row.official_source_present === true,
      methodology_version: CEWS_METHOD_VERSION,
      methodology_calibrated: false as const,
    },
    transmission_channels: transmissionChannels,
    market_relevance: marketRelevance,
    market_impact: marketImpact,
    timestamps: {
      detected_at_utc: detectedAt,
      detected_at_local: canonicalLocalTime,
      published_at_utc: publishedAt,
    },
    integrity: {
      evidence_hash: sha256(row.evidence_hash, "evidence_hash"),
      calculation_hash: sha256(row.calculation_hash, "calculation_hash"),
      market_impact_hash: marketImpact ? sha256(row.market_impact_hash, "market_impact_hash") : null,
    },
    public_url: boundedPublicUrl(row.public_url),
    boundaries: {
      structural_pressure_only: true as const,
      market_price_prediction: false as const,
      trading_instruction: false as const,
      public_performance_claims_allowed: false as const,
    },
  };
}

function normalizeCountry(value: string | null) {
  if (!value) return null;
  const normalized = value.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(normalized)) throw new Error("country must be ISO3 uppercase text");
  return normalized;
}

function normalizeLimit(value: string | null) {
  if (!value) return 20;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 25) {
    throw new Error("limit must be an integer from 1 to 25");
  }
  return parsed;
}

export async function loadPublicEarlyWarningFeed(input: {
  country?: string | null;
  limit?: string | null;
}) {
  const country = normalizeCountry(input.country ?? null);
  const limit = normalizeLimit(input.limit ?? null);
  const db = requireRiskSupabase();

  let query = db
    .from("early_warning_alerts")
    .select(
      "schema_version,content_type,alert_key,visibility,country_iso3,country_name,country_timezone,event_family,event_title,primary_cause,status,cews_score,methodology_version,methodology_calibrated,confidence,independent_evidence_count,official_source_present,transmission_channels,market_relevance,market_impact,market_impact_methodology_version,market_impact_calibrated,market_impact_hash,detected_at_utc,detected_at_local,published_at_utc,public_url,public_eligible,public_policy_version,evidence_hash,calculation_hash",
    )
    .eq("visibility", "public")
    .eq("public_eligible", true)
    .eq("content_type", "early_warning")
    .eq("methodology_version", CEWS_METHOD_VERSION)
    .eq("methodology_calibrated", false)
    .eq("public_policy_version", PUBLIC_EARLY_WARNING_POLICY_VERSION)
    .not("published_at_utc", "is", null)
    .in("status", ["WARNING", "CRITICAL"])
    .order("published_at_utc", { ascending: false })
    .limit(limit);

  if (country) query = query.eq("country_iso3", country);
  const { data, error } = await query;
  if (error) throw new Error("public early warning feed unavailable");

  const items = (data ?? []).map(boundedPublicEarlyWarningRow);
  return {
    feed_schema_version: PUBLIC_EARLY_WARNING_FEED_VERSION,
    generated_at_utc: new Date().toISOString(),
    filters: { country, limit },
    count: items.length,
    items,
    boundaries: {
      informational_decision_support: true as const,
      structural_pressure_only: true as const,
      market_price_prediction: false as const,
      trading_instruction: false as const,
      performance_claim: false as const,
    },
  };
}
