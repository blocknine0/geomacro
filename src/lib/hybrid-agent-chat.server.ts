import { askDomains } from "./ask-domain-guide";
import {
  ASK_GEOMACRO_MAX_LENGTH,
  executeAskGeomacro,
  parseAskGeomacroInput,
  type AskAnswer,
} from "./ask-geomacro-core.server";
import { prepareHybridAgentContext } from "./hybrid-agent-context";
import { planAskOriginalQuestion } from "./ask-on-demand-original.server";
import { COUNTRIES_195 } from "./canonical-country-registry-195";
import { planAskOfficialNumeric } from "./ask-official-numeric.server";

type HybridChatMode = "grounded_ask" | "bounded_follow_up";

/**
 * Only a narrow, deterministic risk-by-location follow-up is inferred.
 * A prior conversation message is NEVER evidence, a system instruction,
 * a score, or a source. Unclear follow-ups must be rewritten by the user.
 */
export function resolveGroundedFollowUp(
  question: string,
  history: ReadonlyArray<{ role: "user" | "assistant"; content: string }>,
): { question: string; mode: HybridChatMode } {
  const previousTopic = [...history].reverse().find(turn => turn.role === "user")?.content ?? "";
  if (/\bgeomacro\b/i.test(previousTopic) && !/\bgeomacro\b/i.test(question) &&
      /\b(?:pricing|prices?|cost|fees?|free|paid|products?|api|agents?|docs?|documentation|contact|privacy|sources?|founder|team|partners?|account|history|internal|database|password|tokens?|credentials?)\b|^how (?:do I|can I|much)|^(?:explain|tell me) more[.!?]*$/i.test(question)) {
    const rewritten = /^(?:explain|tell me) more[.!?]*$/i.test(question) ? "Tell me about Geomacro" : `Geomacro: ${question}`;
    parseAskGeomacroInput({question:rewritten});
    return {question:rewritten,mode:"bounded_follow_up"};
  }
  const followUp = /^(?:please\s+)?(?:explain (?:more|further|that|it)(?: simply| in simple terms)?|tell me more|go deeper|why(?: is that| does (?:that|it) matter)?|what (?:does (?:that|it) mean|are the (?:risks|implications))|(?:make it |be )?(?:shorter|simpler)|summari[sz]e(?: that| it)?)[.!?]*$/i;
  if (followUp.test(question)) {
    if (/\bgeomacro\b/i.test(previousTopic) && !askDomains(previousTopic).length) {
      return {question:"Tell me about Geomacro",mode:"bounded_follow_up"};
    }
    if (!previousTopic || !askDomains(previousTopic).length) throw new Error("AMBIGUOUS_FOLLOW_UP");
    const topic = previousTopic.replace(/^(?:Explain further|Why does this matter|Summarize): /, "");
    const prefix = /why|matter|risks|implications/i.test(question) ? "Why does this matter" :
      /shorter|summari/i.test(question) ? "Summarize" : "Explain further";
    const rewritten = `${prefix}: ${topic}`;
    parseAskGeomacroInput({ question: rewritten });
    return {question:rewritten, mode:"bounded_follow_up"};
  }
  if (/^(?:show (?:me )?)?(?:the )?(?:latest|recent|current) (?:news|updates|developments)[.!?]*$/i.test(question) && askDomains(previousTopic).length === 1) {
    const domain = askDomains(previousTopic)[0];
    const label = domain === "macro" ? "macro" : domain === "rare_earth" ? "critical minerals" : "geopolitics";
    return {question:`Latest ${label} news today?`, mode:"bounded_follow_up"};
  }
  const match = /^(?:(?:and|but)\s+)?(?:what about|how about|and for)\s+([a-z][a-z .'-]{1,65})\s*\??$/i.exec(question);
  if (!match) return { question, mode: "grounded_ask" };

  const previous = [...history].reverse().find(turn => turn.role === "user")?.content ?? "";
  // Country-switch follow-ups reuse ONLY the previous query's explicit topic,
  // mineral and requested time window. Previous answers provide NO evidence.
  const numericPlan = planAskOfficialNumeric(previous);
  if (numericPlan?.kind === "wdi") {
    const target = match[1].trim().toLocaleLowerCase();
    const country = COUNTRIES_195.find(row =>
      [row.name, row.iso3, ...row.aliases].some(name =>
        name.toLocaleLowerCase() === target));
    if (!country) throw new Error("AMBIGUOUS_FOLLOW_UP");
    const metric = numericPlan.indicator === "FP.CPI.TOTL.ZG" ?
      "annual inflation rate" : "annual GDP growth";
    const resolved = "What is the latest " + metric + " in " + country.name + "?";
    parseAskGeomacroInput({ question: resolved });
    return { question: resolved, mode: "bounded_follow_up" };
  }
  const priorPlan = planAskOriginalQuestion(previous);
  if (priorPlan) {
    const targetName = match[1].trim();
    const country = COUNTRIES_195.find(row =>
      [row.name, row.iso3, ...row.aliases].some(alias =>
        alias.toLocaleLowerCase() === targetName.toLocaleLowerCase()));
    if (!country) throw new Error("AMBIGUOUS_FOLLOW_UP");
    const label = priorPlan.categories.length > 1
      ? "geopolitics macro/FX and critical minerals news"
      : priorPlan.categories[0] === "rare_earth"
        ? (priorPlan.mineral ?? "critical minerals") + " news"
        : priorPlan.categories[0] === "macro"
          ? (priorPlan.topics.includes("fx_external_risk") ? "FX" :
             priorPlan.topics.includes("sovereign_risk") ? "sovereign debt" : "macro") + " news"
          : (priorPlan.topics.includes("sanctions_restrictions") ? "sanctions" :
             priorPlan.topics.includes("conflict_geopolitics") ? "conflict" : "geopolitics") + " news";
    const age = priorPlan.max_age_seconds;
    const window = age <= 86400 ? "today" : age === 604800 ? "this week" :
      age % 86400 === 0 ? "last " + (age / 86400) + " days" :
      "last " + Math.max(1, Math.floor(age / 3600)) + " hours";
    const rewritten = "Latest " + label + " in " + country.name + " " + window + "?";
    parseAskGeomacroInput({ question: rewritten });
    return {question:rewritten,mode:"bounded_follow_up"};
  }
  const topic = [
    /geopolitic(?:al|s)?/i.test(previous) && /\brisk\b/i.test(previous) ? "geopolitical" : null,
    /(?:macroeconomic|macro\/fx|macro|currency|foreign exchange)/i.test(previous) && /\brisk\b/i.test(previous) ? "macroeconomic" : null,
    /(?:critical mineral|rare earth|mineral supply)/i.test(previous) && /\brisk\b/i.test(previous) ? "critical mineral supply" : null,
  ].filter((part): part is string => part !== null);

  const target = match[1].trim();
  const domains = askDomains(previous);
  if (topic.length === 0 && domains.length === 1) {
    const country = COUNTRIES_195.find(row => [row.name, row.iso3, ...row.aliases].some(name => name.toLowerCase() === target.toLowerCase()));
    if (!country) throw new Error("AMBIGUOUS_FOLLOW_UP");
    const metric = /\binflation\b/i.test(previous) ? "annual inflation rate" : /\bgdp\b/i.test(previous) ? "annual GDP growth" : null;
    const label = domains[0] === "macro" ? "macro" : domains[0] === "rare_earth" ? "critical minerals" : "geopolitics";
    const rewritten = metric ? `What is the latest ${metric} in ${country.name}?` : `Latest ${label} news in ${country.name} today?`;
    parseAskGeomacroInput({question:rewritten});
    return {question:rewritten,mode:"bounded_follow_up"};
  }
  if (topic.length !== 1 || /^(?:it|this|that|there|here|those|them|same|more|today|yesterday)$/i.test(target)) {
    throw new Error("AMBIGUOUS_FOLLOW_UP");
  }
  const resolved = `What is the current ${topic[0]} risk in ${target}?`;
  // The canonical Ask validator applies to both raw and rewritten questions.
  parseAskGeomacroInput({ question: resolved });
  return { question: resolved, mode: "bounded_follow_up" };
}

/**
 * Conversational adapter on the EXISTING governed Ask execution path.
 * All retrieval, verification, public shaping and per-client rate limits
 * stay in executeAskGeomacro; this module never signs or settles payment.
 */
export async function executeHybridChatTurn(
  input: { question: unknown; history?: unknown },
  clientKey: string,
): Promise<{
  answer: AskAnswer;
  context_turns: number;
  mode: HybridChatMode;
  resolved_question: string;
}> {
  const parsed = prepareHybridAgentContext(input.question, input.history);
  if (!parsed.ok) throw new Error(parsed.code);
  if (parsed.question.length > ASK_GEOMACRO_MAX_LENGTH) {
    throw new Error("QUESTION_TOO_LONG");
  }
  // Validate the user's original text before any deterministic rewrite.
  const rawQuestion = parseAskGeomacroInput({ question: parsed.question }).question;
  const resolved = resolveGroundedFollowUp(rawQuestion, parsed.history);
  const answer = await executeAskGeomacro({ question: resolved.question }, clientKey);
  return {
    answer: /^(?:please\s+)?(?:(?:make it |be )?(?:shorter)|summari[sz]e(?: that| it)?)[.!?]*$/i.test(rawQuestion)
      ? {...answer, what_changed:"", why_it_matters:"", geomacro_view:""} : answer,
    context_turns: parsed.history.length,
    mode: resolved.mode,
    resolved_question: resolved.question,
  };
}
