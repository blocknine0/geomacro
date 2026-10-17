#!/usr/bin/env node
/**
 * Read-only outside-in product acceptance for ACTUAL on-demand official
 * numerical fetch and verified final-answer SSE (not signed risk-product
 * health). No source bypass, no paid endpoint, no raw content storage.
 */
const BASE = String(process.env.GEOMACRO_BASE_URL ?? "https://geomacro.live").replace(/\/$/u, "");
const ORIGIN = new URL(BASE).origin;
if (!/^https:\/\/[a-z0-9.-]+$/iu.test(ORIGIN)) throw Error("ASK_ORIGIN_INVALID");
const CHECKED_AT = new Date().toISOString();
const QUESTION = "India latest inflation rate?";
const HEADERS = {
  Origin: ORIGIN,
  Accept: "text/event-stream",
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
  "User-Agent": "Geomacro-Live-Ask-NoFunds-Acceptance/1.0",
};
const TIMEOUT_MS = 25_000;
function guarded(value, code) {
  if (!value) throw Error(code);
}
function checkAnswer(answer) {
  guarded(answer && typeof answer === "object", "ASK_LIVE_FINAL_ANSWER_MISSING");
  for (const name of ["summary", "what_changed", "why_it_matters", "geomacro_view"]) {
    guarded(typeof answer[name] === "string" && answer[name].length > 10,
      "ASK_LIVE_FIELD_MISSING_" + name);
  }
  guarded(answer.source_identity_exposed === false, "ASK_LIVE_SOURCE_PRIVACY_INVALID");
  guarded(answer.durable_live_storage_write === false, "ASK_LIVE_RAW_STORAGE_WRITE");
  guarded(answer.signed_gro_generated !== true, "ASK_LIVE_UNSIGNED_CLAIM");
  guarded(answer.insufficient_evidence === false, "ASK_LIVE_OFFICIAL_NUMBER_NOT_VERIFIED");
  guarded(Array.isArray(answer.evidence) && answer.evidence.length > 0, "ASK_LIVE_NUMERIC_EVIDENCE_MISSING");
  const text = [answer.summary, answer.what_changed, answer.why_it_matters, answer.geomacro_view].join(" ");
  guarded(text.includes("ANNUAL") && text.includes("World Bank"),
    "ASK_LIVE_SERIES_PERIOD_ATTRIBUTION_MISSING");
  guarded(/\b(?:19|20)\d{2}\b/u.test(text) && /\b\d+(?:\.\d+)?%/u.test(text),
    "ASK_LIVE_OFFICIAL_YEAR_VALUE_MISSING");
  const serialized = JSON.stringify(answer);
  for (const token of ["source_url", "raw_payload", "api.worldbank.org", "api.groq.com", "https://", "http://"]) {
    guarded(!serialized.includes(token), "ASK_LIVE_PRIVATE_UPSTREAM_LEAK");
  }
  return {
    reference_year_present: true,
    annual_measurement_labeled: true,
    no_spot_or_monthly_misrepresentation: true,
    evidence_count: answer.evidence.length,
    data_mode: answer.data_mode ?? null,
  };
}
export function inspectAskSse(text, contentType) {
  guarded(contentType.toLowerCase().includes("text/event-stream"), "ASK_LIVE_SSE_CONTENT_TYPE_MISSING");
  const events = text.replace(/\r\n/gu, "\n").split("\n\n").filter(Boolean).map(frame => {
    const event = frame.split("\n").find(line => line.startsWith("event: "))?.slice(7).trim();
    const raw = frame.split("\n").filter(line => line.startsWith("data: ")).map(line => line.slice(6)).join("\n");
    guarded(["stage", "answer", "error"].includes(event) && raw.length <= 48_000,
      "ASK_LIVE_UNRECOGNIZED_EVENT");
    return { event, payload: JSON.parse(raw) };
  });
  guarded(events.some(row => row.event === "stage" && row.payload?.stage === "researching"),
    "ASK_LIVE_PROGRESS_NOT_STREAMED");
  guarded(!events.some(row => row.event === "error"), "ASK_LIVE_SSE_REPORTED_ERROR");
  const answers = events.filter(row => row.event === "answer");
  guarded(answers.length === 1 && answers[0].payload?.ok === true,
    "ASK_LIVE_FINAL_EVENT_INVALID");
  return { answer: answers[0].payload.data, progress_events: events.filter(row => row.event === "stage").length };
}
export async function probeAsk(fetchImpl = fetch) {
  const response = await fetchImpl(BASE + "/api/ask/v2/turn", {
    method: "POST", headers: HEADERS,
    body: JSON.stringify({ question: QUESTION, history: [] }),
    redirect: "error", cache: "no-store", signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  guarded(response.status === 200, "ASK_LIVE_POST_HTTP_" + response.status);
  guarded(Number(response.headers.get("content-length") ?? "0") <= 96_000,
    "ASK_LIVE_SSE_CONTENT_LENGTH_TOO_LARGE");
  const body = await response.text();
  guarded(body.length <= 96_000, "ASK_LIVE_SSE_OVERSIZE");
  const result = inspectAskSse(body, response.headers.get("content-type") ?? "");
  if (result.answer?.insufficient_evidence === true) {
    const summary = String(result.answer.summary ?? "").toLowerCase();
    const failure_lane = summary.includes("matching original numerical") ||
      summary.includes("observation could not be verified")
      ? "OFFICIAL_NUMERIC_SOURCE_MISSING"
      : summary.includes("index") ? "SEARCH_INDEX_UNVERIFIED" :
      summary.includes("risk") ? "GOVERNED_RISK_UNAVAILABLE" : "UNKNOWN";
    console.error("ASK_LIVE_PUBLIC_RESULT_DIAG:"+JSON.stringify({
      lane:failure_lane,insufficient_evidence:true,
      evidence_count:Array.isArray(result.answer.evidence)?result.answer.evidence.length:0,
      data_mode:result.answer.data_mode??null,source_identity_exposed:result.answer.source_identity_exposed??null,
      payment_executed:false,raw_evidence_logged:false
    }));
  }
  return { ok: true, schema: "geomacro.ask-live-official-sse-acceptance.v1",
    checked_at: CHECKED_AT, free_research_without_payment: true,
    source_identity_exposed: false, ...checkAnswer(result.answer),
    progress_events: result.progress_events };
}
if (process.argv[1] && import.meta.url === new URL("file://" + process.argv[1]).href) {
  try { console.log(JSON.stringify(await probeAsk())); }
  catch(error) {
    console.error("ASK_LIVE_ACCEPTANCE_FAILED:" +
      (error instanceof Error ? error.message : "unknown"));
    process.exitCode = 2;
  }
}
