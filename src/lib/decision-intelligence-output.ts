import { buildPaidMarketWatch } from "./paid-market-watch";

export const GEOMACRO_DECISION_INTELLIGENCE_SCHEMA =
  "geomacro.decision-intelligence.v1" as const;

export type DecisionIntelligenceSubject =
  | { type: "country"; country_iso3: string }
  | {
      type: "corridor";
      origin_country_iso3: string;
      destination_country_iso3: string;
    };

export type DecisionAction =
  | "PROCEED"
  | "PROCEED_WITH_GUARDRAILS"
  | "REVIEW"
  | "PAUSE"
  | "INSUFFICIENT_EVIDENCE";

export type DecisionIntelligenceInput = {
  subject: DecisionIntelligenceSubject;
  state_version: string | null;
  risk: null | {
    score: number;
    label: string;
    previous_score?: number | null;
    delta?: number | null;
    direction?: string | null;
  };
  confidence: number | null;
  observed_at: string | null;
  expires_at?: string | null;
  attribution?: Array<{
    driver: string;
    delta_contribution?: number | null;
    score_contribution?: number | null;
  }>;
  developments?: Array<{
    event_type?: string | null;
    materiality?: string | null;
    direction?: string | null;
    confidence?: number | null;
  }>;
  structural?: {
    available_dimensions?: string[];
    latest_observed_at?: string | null;
  } | null;
  live?: {
    current_event_signal?: boolean;
    event_count?: number;
    pipeline_lag_seconds?: number | null;
    checked_at?: string | null;
  } | null;
  risk_gate_decision?: string | null;
  as_of: string;
  product?: { capability:string; variant:string } | null;
  locale?: "en"|"bn"|"hi";
  refresh_not_before_seconds?:number|null;
};

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function subjectLabel(subject: DecisionIntelligenceSubject) {
  return subject.type === "country"
    ? subject.country_iso3
    : `${subject.origin_country_iso3} → ${subject.destination_country_iso3}`;
}

function freshness(observedAt: string | null, asOf: string) {
  if (!observedAt) {
    return { status: "UNKNOWN" as const, age_seconds: null };
  }
  const observed = Date.parse(observedAt);
  const reference = Date.parse(asOf);
  if (!Number.isFinite(observed) || !Number.isFinite(reference)) {
    return { status: "UNKNOWN" as const, age_seconds: null };
  }
  const age = Math.max(0, Math.floor((reference - observed) / 1000));
  if (age <= 86_400) return { status: "REAL_TIME" as const, age_seconds: age };
  if (age <= 7 * 86_400) return { status: "CURRENT" as const, age_seconds: age };
  return { status: "AGING" as const, age_seconds: age };
}

function normalizeRiskLabel(label: string) {
  return label.trim().replace(/\s+/g, "_").toUpperCase();
}

function decisionFrom(input: DecisionIntelligenceInput): DecisionAction {
  const gate = (input.risk_gate_decision ?? "").toUpperCase();
  if (gate.includes("BLOCK") || gate.includes("PAUSE")) return "PAUSE";
  if (gate.includes("REVIEW")) return "REVIEW";
  if (!input.risk) return "INSUFFICIENT_EVIDENCE";

  const label = normalizeRiskLabel(input.risk.label);
  if (/(CRITICAL|SEVERE|EXTREME|VERY_HIGH)/.test(label)) return "PAUSE";
  if (/(HIGH|ELEVATED)/.test(label)) return "REVIEW";
  if (/(MODERATE|MEDIUM)/.test(label)) return "PROCEED_WITH_GUARDRAILS";
  return "PROCEED";
}

function whyItMatters(action: DecisionAction, subject: string) {
  switch (action) {
    case "PROCEED":
      return `${subject} currently shows no verified risk condition that requires an added Geomacro guardrail.`;
    case "PROCEED_WITH_GUARDRAILS":
      return `${subject} remains usable, but the detected conditions can materially change cost, timing or execution risk.`;
    case "REVIEW":
      return `${subject} has elevated verified risk signals that merit human or policy review before material exposure.`;
    case "PAUSE":
      return `${subject} currently meets a Geomacro risk condition that warrants pausing the assessed action.`;
    default:
      return `Geomacro does not have enough verified current evidence to make a decision-grade assessment for ${subject}.`;
  }
}

function guardrail(action: DecisionAction) {
  switch (action) {
    case "PROCEED_WITH_GUARDRAILS":
      return "Use tighter exposure limits and re-check Geomacro before material execution.";
    case "REVIEW":
      return "Require policy or human review and refresh the assessment immediately before execution.";
    case "PAUSE":
      return "Do not rely on this assessment to proceed until the triggering risk state changes and is re-verified.";
    case "PROCEED":
      return "Continue normal controls and re-check when conditions or exposure change.";
    default:
      return "Do not charge or act on this result until Geomacro can establish sufficient verified evidence.";
  }
}

function localizeBoundedDecision(input:DecisionIntelligenceInput,action:DecisionAction,subject:string){
  const locale=input.locale;
  if(locale!=="bn"&&locale!=="hi")return null;
  const score=input.risk?.score;
  const risk=input.risk?.label ?? "UNAVAILABLE";
  const formatted=typeof score==="number"&&Number.isFinite(score)?score.toFixed(2):null;
  const actionsBn:Record<DecisionAction,string>={
    PROCEED:"স্বাভাবিক নিয়ন্ত্রণ বজায় রেখে এগোনোর শর্ত মূল্যায়ন করুন",
    PROCEED_WITH_GUARDRAILS:"অতিরিক্ত ঝুঁকি-নিয়ন্ত্রণ ও পর্যালোচনা প্রয়োজন",
    REVIEW:"মানবিক বা নীতিগত পর্যালোচনা প্রয়োজন",
    PAUSE:"সিদ্ধান্ত কার্যকর করার আগে পুনরায় যাচাই প্রয়োজন",
    INSUFFICIENT_EVIDENCE:"যাচাইকৃত প্রমাণ অপর্যাপ্ত",
  };
  const actionsHi:Record<DecisionAction,string>={
    PROCEED:"सामान्य नियंत्रणों के साथ आगे बढ़ने की शर्तों की समीक्षा करें",
    PROCEED_WITH_GUARDRAILS:"अतिरिक्त जोखिम नियंत्रण और समीक्षा आवश्यक है",
    REVIEW:"मानवीय या नीतिगत समीक्षा आवश्यक है",
    PAUSE:"निर्णय लागू करने से पहले पुनः सत्यापन आवश्यक है",
    INSUFFICIENT_EVIDENCE:"सत्यापित प्रमाण पर्याप्त नहीं हैं",
  };
  const bn=locale==="bn";
  return {
    language:locale,
    headline:formatted===null
      ? bn?`${subject}: সিদ্ধান্ত-যোগ্য বর্তমান ঝুঁকি নির্ধারণের জন্য পর্যাপ্ত যাচাইকৃত তথ্য নেই।`
          :`${subject}: निर्णय योग्य मौजूदा जोखिम तय करने के लिए पर्याप्त सत्यापित जानकारी नहीं है।`
      : bn?`${subject}: যাচাইকৃত ঝুঁকির স্তর ${risk}; স্কোর ${formatted}/100।`
          :`${subject}: सत्यापित जोखिम स्तर ${risk}; स्कोर ${formatted}/100।`,
    decision_context:bn?actionsBn[action]:actionsHi[action],
    caveat:bn?"এটি মূল যাচাইকৃত structured data-এর সীমিত ভাষান্তর; স্বয়ংক্রিয় লেনদেনের অনুমতি নয়।"
      :"यह मूल सत्यापित संरचित डेटा का सीमित भाषायी सार है; स्वचालित लेनदेन की अनुमति नहीं है।",
    scope:"BOUNDED_FACTUAL_SUMMARY_ONLY" as const,
    execution_authorized:false as const,
  } as const;
}

export function buildDecisionIntelligence(
  input: DecisionIntelligenceInput,
) {
  const subject = subjectLabel(input.subject);
  const currentFreshness = freshness(input.observed_at, input.as_of);
  const drivers = [...(input.attribution ?? [])]
    .sort(
      (a, b) =>
        Math.abs(b.delta_contribution ?? b.score_contribution ?? 0) -
        Math.abs(a.delta_contribution ?? a.score_contribution ?? 0),
    )
    .slice(0, 3);

  const detected = drivers.map((row) => {
    const delta = finite(row.delta_contribution)
      ? ` (${row.delta_contribution! >= 0 ? "+" : ""}${row.delta_contribution!.toFixed(2)} change contribution)`
      : "";
    return `${row.driver}${delta}`;
  });

  if (input.live?.current_event_signal && (input.live.event_count ?? 0) > 0) {
    detected.push(`${input.live.event_count} current material development(s) passed Geomacro verification`);
  }

  const action = decisionFrom(input);
  const score = input.risk?.score ?? null;
  const label = input.risk?.label ?? "UNAVAILABLE";
  const changeDelta = finite(input.risk?.delta) ? input.risk!.delta! : null;
  const primaryCause = detected[0] ??
    (input.risk
      ? "a verified risk state without a dominant attributable driver"
      : "insufficient verified current evidence for a decision-grade risk state");

  const answer = input.risk
    ? `${subject} is ${input.risk.label} at ${input.risk.score.toFixed(2)}/100. ${whyItMatters(action, subject)}`
    : `Geomacro cannot establish a decision-grade risk state for ${subject} from currently verified evidence.`;

  return {
    schema_version: GEOMACRO_DECISION_INTELLIGENCE_SCHEMA,
    subject: input.subject,
    status: input.risk ? "SUPPORTED" : "INSUFFICIENT_EVIDENCE",
    risk: {
      level: label,
      score,
      confidence: input.confidence,
    },
    freshness: currentFreshness,
    answer,
    cause: `Geomacro detects this because ${primaryCause}.`,
    geomacro_detected: detected,
    why_it_matters: whyItMatters(action, subject),
    decision: {
      action,
      guardrail: guardrail(action),
      execution_authorized: false,
    },
    change: {
      direction: input.risk?.direction ?? null,
      delta: changeDelta,
      previous_score: finite(input.risk?.previous_score)
        ? input.risk!.previous_score!
        : null,
      material_change: changeDelta === null ? null : Math.abs(changeDelta) >= 1,
      primary_cause: detected[0] ?? null,
    },
    watch_next: drivers.map((row) => row.driver),
    ...(localizeBoundedDecision(input,action,subject)?{localized:localizeBoundedDecision(input,action,subject)!}:{}),
    market_watch: buildPaidMarketWatch({
      capability:input.product?.capability??null,
      variant:input.product?.variant??null,
      state_version:input.state_version,
      verified_dimensions:input.structural?.available_dimensions??[],
      verified_signed_drivers:input.risk?(input.attribution??[]).map(row=>row.driver):[],
      qualified_event_types:input.live?.current_event_signal
        ? (input.developments??[]).map(row=>row.event_type??"") : [],
      latest_evidence_at:input.structural?.latest_observed_at??input.observed_at,
      refresh_not_before_seconds:input.refresh_not_before_seconds??null,
    }),
    evidence_quality: {
      confidence: input.confidence,
      current_event_signal: input.live?.current_event_signal ?? false,
      current_material_event_count: input.live?.event_count ?? 0,
      available_dimensions: input.structural?.available_dimensions ?? [],
      latest_observed_at:
        input.structural?.latest_observed_at ?? input.observed_at,
    },
    state_version: input.state_version,
    as_of: input.as_of,
    delivery_boundary: "DERIVED_DECISION_INTELLIGENCE_ONLY",
    raw_data_delivered: false,
    execution_authorized: false,
  } as const;
}
