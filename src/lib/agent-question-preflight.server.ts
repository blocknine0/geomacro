import { createHash } from "node:crypto";
import { z } from "zod";
import {
  AGENT_QUERY_SCHEMA_VERSION,
  agentAdaptiveQuerySchema,
  buildAgentQueryPlan,
  inferAgentQueryIntent,
  inferAgentQueryTopics,
  type AgentAdaptiveQuery,
} from "./agent-query-plan";
import { checkAgentQueryDeliverability } from "./agent-query-deliverability.server";
import { checkAgentQueryExternalModule } from "./agent-query-external-modules.server";
import { getCoinbaseX402Config } from "./coinbase-x402.server";
import { requireRiskSupabase } from "./risk-supabase.server";

const QUESTION_SCHEMA_VERSION = "geomacro.paid-question-preflight.v1" as const;
const MAX_MATCHES = 25;

const requestSchema = z.object({
  question: z.string().trim().min(4).max(2_000),
  client_request_id: z.string().trim().min(4).max(128).optional(),
  max_age_seconds: z.number().int().positive().max(94_608_000).optional(),
  evidence: z.enum(["required", "summary"]).default("required"),
  detail: z.enum(["compact", "standard", "full"]).default("standard"),
  risk_gate_context: z.object({
    policy_preset: z.enum(["balanced", "cautious", "strict"]).default("balanced"),
    action_type: z.enum(["treasury_payment", "vendor_payment", "agent_payment", "exposure_review"]),
    amount_usdc: z.number().finite().positive().max(1_000_000_000).optional(),
  }).strict().optional(),
}).strict();

export type PaidQuestionPreflightRequest = z.infer<typeof requestSchema>;

type RegistryRow = {
  iso3: string;
  country_name: string;
  aliases: unknown;
  demonyms: unknown;
};

type CountryMatch = {
  iso3: string;
  country_name: string;
  matched_term: string;
  start: number;
  end: number;
};

function normalizeText(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function safeStrings(value: unknown) {
  if (!Array.isArray(value)) return [] as string[];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}

function boundaryMatch(question: string, term: string) {
  const normalizedQuestion = ` ${normalizeText(question)} `;
  const normalizedTerm = normalizeText(term);
  if (normalizedTerm.length < 3) return -1;
  return normalizedQuestion.indexOf(` ${normalizedTerm} `);
}

function directIso3Matches(question: string, rows: RegistryRow[]) {
  const tokens = new Set(question.match(/\b[A-Z]{3}\b/g) ?? []);
  const byIso3 = new Map(rows.map((row) => [row.iso3.toUpperCase(), row]));
  const out: CountryMatch[] = [];
  for (const token of tokens) {
    const row = byIso3.get(token);
    if (!row) continue;
    const start = question.indexOf(token);
    out.push({ iso3: row.iso3.toUpperCase(), country_name: row.country_name, matched_term: token, start, end: start + token.length });
  }
  return out;
}

function countryMatches(question: string, rows: RegistryRow[]) {
  const normalizedQuestion = normalizeText(question);
  const matches = [...directIso3Matches(question, rows)];
  for (const row of rows) {
    const terms = [row.country_name, ...safeStrings(row.aliases), ...safeStrings(row.demonyms)]
      .map((term) => term.trim())
      .filter((term) => term.length >= 3)
      .sort((a, b) => b.length - a.length);
    for (const term of terms) {
      const normalizedTerm = normalizeText(term);
      const paddedStart = boundaryMatch(normalizedQuestion, normalizedTerm);
      if (paddedStart < 0) continue;
      const start = Math.max(0, paddedStart - 1);
      matches.push({
        iso3: row.iso3.toUpperCase(),
        country_name: row.country_name,
        matched_term: term,
        start,
        end: start + normalizedTerm.length,
      });
      break;
    }
  }

  const unique = new Map<string, CountryMatch>();
  for (const match of matches.sort((a, b) => a.start - b.start || b.matched_term.length - a.matched_term.length)) {
    if (!unique.has(match.iso3)) unique.set(match.iso3, match);
  }
  return [...unique.values()].slice(0, MAX_MATCHES);
}

function mentionsHistoricalTime(question: string) {
  return /\b(?:as of|in|during|since)\s+(?:19|20)\d{2}\b/i.test(question)
    || /\b(?:last year|two years ago|historical|previous year)\b/i.test(question);
}

function inferActionType(question: string): "treasury_payment" | "vendor_payment" | "agent_payment" | "exposure_review" {
  if (/\btreasury\b/i.test(question)) return "treasury_payment";
  if (/\bvendor\b|\bsupplier\b/i.test(question)) return "vendor_payment";
  if (/\bexposure\b|\bportfolio\b/i.test(question)) return "exposure_review";
  return "agent_payment";
}

function inferAmountUsdc(question: string) {
  const match = question.match(/(?:\bUSDC\s*|\$\s*)(\d{1,12}(?:\.\d{1,6})?)\b|\b(\d{1,12}(?:\.\d{1,6})?)\s*USDC\b/i);
  const raw = match?.[1] ?? match?.[2];
  if (!raw) return undefined;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 && value <= 1_000_000_000 ? value : undefined;
}

function rankingSpec(question: string) {
  const intent = inferAgentQueryIntent(question);
  if (intent !== "ranking_filter") return undefined;
  const lowToHigh = /\blowest risk\b|\bleast risky\b/i.test(question);
  const limitMatch = question.match(/\btop\s+(\d{1,2})\b/i);
  const limit = limitMatch ? Math.min(25, Math.max(1, Number(limitMatch[1]))) : undefined;
  return {
    metric: "risk_object_score" as const,
    order: lowToHigh ? "low_to_high" as const : "high_to_low" as const,
    ...(limit ? { limit } : {}),
  };
}

function changeSpec(question: string) {
  return inferAgentQueryIntent(question) === "change_since"
    ? { baseline: "previous_published" as const }
    : undefined;
}

function looksDirectional(question: string, matches: CountryMatch[]) {
  if (matches.length < 2) return false;
  if (/\b(?:corridor|shipping route|trade route|cross[- ]border)\b/i.test(question)) return true;
  const first = matches[0];
  const second = matches[1];
  const between = normalizeText(question).slice(Math.max(0, first.end), Math.max(0, second.start));
  return /\b(?:to|into|toward|towards|from)\b/.test(between) || /\bfrom\b.*\bto\b/i.test(question);
}

function subjectsForQuestion(question: string, matches: CountryMatch[]) {
  if (matches.length === 0) throw new Error("QUESTION_SUBJECT_UNRESOLVED");
  const inferredIntent = inferAgentQueryIntent(question);

  if (looksDirectional(question, matches) && inferredIntent !== "comparison" && inferredIntent !== "ranking_filter") {
    const [origin, destination] = matches;
    return [{
      type: "corridor" as const,
      origin_country_iso3: origin.iso3,
      destination_country_iso3: destination.iso3,
    }];
  }

  if (matches.length > 1) {
    if (inferredIntent && !["comparison", "ranking_filter"].includes(inferredIntent)) {
      throw new Error("QUESTION_MULTIPLE_SUBJECTS_AMBIGUOUS");
    }
    return matches.map((match) => ({ type: "country" as const, country_iso3: match.iso3 }));
  }

  return [{ type: "country" as const, country_iso3: matches[0].iso3 }];
}

function questionHash(question: string) {
  return createHash("sha256").update(normalizeText(question), "utf8").digest("hex");
}

async function loadCountryRegistry() {
  const db = requireRiskSupabase();
  const { data, error } = await db
    .from("live_country_registry")
    .select("iso3,country_name,aliases,demonyms")
    .eq("enabled", true)
    .order("iso3");
  if (error) throw error;
  const rows = (data ?? []) as RegistryRow[];
  if (rows.length === 0) throw new Error("COUNTRY_REGISTRY_UNAVAILABLE");
  return rows;
}

export async function normalizePaidQuestion(raw: unknown): Promise<AgentAdaptiveQuery> {
  const input = requestSchema.parse(raw);
  if (mentionsHistoricalTime(input.question)) {
    throw new Error("QUESTION_HISTORICAL_TIME_REQUIRES_EXPLICIT_STRUCTURED_AS_OF");
  }

  const rows = await loadCountryRegistry();
  const matches = countryMatches(input.question, rows);
  const subjects = subjectsForQuestion(input.question, matches);
  const inferredTopics = inferAgentQueryTopics(input.question);
  if (inferredTopics.length === 0) throw new Error("QUESTION_TOPIC_UNRESOLVED");

  const inferredIntent = inferAgentQueryIntent(input.question);
  const riskGateRequested = inferredTopics.includes("risk_gate") || inferredIntent === "risk_gate";
  const suppliedContext = input.risk_gate_context;
  const inferredContext = riskGateRequested
    ? {
        policy_preset: "balanced" as const,
        action_type: inferActionType(input.question),
        ...(inferAmountUsdc(input.question) !== undefined ? { amount_usdc: inferAmountUsdc(input.question) } : {}),
      }
    : undefined;

  return agentAdaptiveQuerySchema.parse({
    schema_version: AGENT_QUERY_SCHEMA_VERSION,
    question: input.question,
    subjects,
    topics: inferredTopics,
    ...(inferredIntent ? { intent: inferredIntent } : {}),
    ...(rankingSpec(input.question) ? { ranking: rankingSpec(input.question) } : {}),
    ...(changeSpec(input.question) ? { change: changeSpec(input.question) } : {}),
    max_age_seconds: input.max_age_seconds,
    evidence: input.evidence,
    detail: input.detail,
    risk_gate_context: suppliedContext ?? inferredContext,
    client_request_id: input.client_request_id,
  });
}

export async function preflightPaidQuestion(raw: unknown) {
  const request = await normalizePaidQuestion(raw);
  const plan = buildAgentQueryPlan(request);
  const availability = await checkAgentQueryDeliverability(plan, {
    externalModuleChecker: checkAgentQueryExternalModule,
  });
  const config = getCoinbaseX402Config();

  return {
    schema_version: QUESTION_SCHEMA_VERSION,
    ok: availability.deliverable,
    chargeable: availability.deliverable,
    payment_required_now: false,
    product: "geomacro_adaptive_risk_intelligence_v1",
    question_hash: questionHash(request.question ?? ""),
    query_plan_hash: plan.query_plan_hash,
    paid_endpoint: "/api/x402/intelligence",
    paid_request: request,
    exact_price: config ? {
      amount_usdc: config.priceUsdc,
      amount_atomic: config.amountAtomic,
      asset: "USDC",
      asset_contract: config.asset,
      network: config.network,
    } : null,
    availability,
    privacy: {
      external_llm_used: false,
      raw_question_sent_to_payment_provider: false,
      premium_payload_included: false,
      cacheable: false,
    },
    execution_authorized: false,
  };
}
