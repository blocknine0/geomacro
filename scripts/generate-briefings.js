// scripts/generate-briefings.js
//
// Standalone, deliberately decoupled from create-markets.js — this only
// reads events + writes Supabase, never touches the chain, so a bug here
// cannot break market creation/resolution/finalization. Picks up markets
// that exist (market_created = true) but have no briefing yet, and
// generates a genuine two-sided briefing: Hawk argues escalation, Dove
// argues de-escalation, each with its own independent conviction score.
//
// This directly replaces content the frontend was previously showing with
// no real backend behind it (fabricated conviction %/reasoning text).
import { createClient } from "@supabase/supabase-js";
import Groq from "groq-sdk";
import fetch from "node-fetch";

const MAX_BRIEFINGS_PER_RUN = Number(process.env.MAX_BRIEFINGS_PER_RUN || 30);
const MAX_RATE_LIMIT_RETRIES = Number(process.env.GROQ_MAX_RETRIES || 5);
const BASE_BACKOFF_MS = 2000;
const MAX_BACKOFF_MS = 60 * 1000;
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function callGroqWithBackoff(fn, label) {
  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (error) {
      const status = error?.status ?? error?.response?.status;
      const message = String(error?.message ?? error?.error?.message ?? "");
      const isDailyQuotaExhausted = status === 429 && /tokens per day|requests per day|TPD|RPD/i.test(message);
      if (isDailyQuotaExhausted) {
        const quotaErr = new Error(`Groq daily token quota exhausted: ${message}`);
        quotaErr.isQuotaExhausted = true;
        throw quotaErr;
      }
      if (status !== 429 || attempt >= MAX_RATE_LIMIT_RETRIES) throw error;
      const backoff = Math.min(BASE_BACKOFF_MS * 2 ** attempt, MAX_BACKOFF_MS);
      attempt++;
      console.log(`  ⏳ Rate limited on ${label} (attempt ${attempt}/${MAX_RATE_LIMIT_RETRIES}). Waiting ${Math.round(backoff / 1000)}s...`);
      await delay(backoff + Math.random() * 500);
    }
  }
}

async function callCerebras(cerebrasApiKey, prompt) {
  const response = await fetch("https://api.cerebras.ai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${cerebrasApiKey}` },
    body: JSON.stringify({
      model: "llama3.1-8b",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.4,
      max_tokens: 200,
    }),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    const err = new Error(`Cerebras HTTP ${response.status}: ${body.slice(0, 200)}`);
    err.status = response.status;
    if (response.status === 429) err.isQuotaExhausted = true;
    throw err;
  }
  const data = await response.json();
  return data.choices[0].message.content;
}

function buildBriefingPrompt(side, event) {
  const stance = side === "HAWK"
    ? "You are Agent Hawk, arguing the ESCALATION case — that this situation gets worse, tensions rise, or the risk materializes."
    : "You are Agent Dove, arguing the DE-ESCALATION case — that this situation stabilizes, cools down, or the risk fails to materialize.";

  return `${stance}

Event:
- Category: ${event.category}
- Headline: "${event.source_title}"
- Narrative: "${(event.narrative || "").slice(0, 250)}"
- Summary: "${(event.summary || "").slice(0, 250)}"
- Severity score (0-100): ${event.severity}

Give your honest independent case in 1-2 sentences (max 220 characters), and a conviction score 0-100 for how strongly the evidence supports YOUR side specifically. Do not force a high score if the evidence is weak — an honest 30% is more useful than a fabricated 80%.

Respond STRICTLY in JSON, no markdown fences, no extra text:
{ "reasoning": "your 1-2 sentence case", "conviction": <integer 0-100> }`;
}

function parseBriefing(rawContent) {
  const cleaned = rawContent.replace(/```json|```/g, "").trim();
  const result = JSON.parse(cleaned);
  const conviction = Math.max(0, Math.min(100, Math.round(Number(result.conviction))));
  return { reasoning: String(result.reasoning || "").slice(0, 300), conviction };
}

async function generateSideBriefing(side, event, groq, groqApiKey, cerebrasApiKey) {
  const prompt = buildBriefingPrompt(side, event);
  try {
    const completion = await callGroqWithBackoff(
      () => groq.chat.completions.create({
        messages: [{ role: "user", content: prompt }],
        model: "llama-3.1-8b-instant",
        response_format: { type: "json_object" },
        temperature: 0.4,
        max_tokens: 200,
      }),
      `${side} briefing (${event.source_title?.slice(0, 30)})`,
    );
    return parseBriefing(completion.choices[0].message.content);
  } catch (e) {
    if (!e.isQuotaExhausted || !cerebrasApiKey) throw e;
    console.log(`  ↪ Groq quota exhausted for ${side} briefing — falling back to Cerebras.`);
    const raw = await callCerebras(cerebrasApiKey, prompt);
    return parseBriefing(raw);
  }
}

async function main() {
  const { APP_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GROQ_API_KEY, CEREBRAS_API_KEY } = process.env;

  if (!APP_SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !GROQ_API_KEY)
    throw new Error("Missing required env (APP_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GROQ_API_KEY).");
  if (!CEREBRAS_API_KEY) console.warn("⚠️ CEREBRAS_API_KEY missing — no fallback if Groq's daily quota runs out mid-run.");

  const adminSupabase = createClient(APP_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const groq = new Groq({ apiKey: GROQ_API_KEY, timeout: 30 * 1000, maxRetries: 3, fetch });

  const { data: events, error } = await adminSupabase
    .from("events")
    .select("id, category, source_title, narrative, summary, severity")
    .eq("market_created", true)
    .is("briefing_generated_at", null)
    .order("created_at", { ascending: false })
    .limit(MAX_BRIEFINGS_PER_RUN);

  if (error) throw new Error(`Supabase error: ${error.message}`);
  if (!events || events.length === 0) return console.log("No markets need a briefing right now.");

  console.log(`Generating briefings for ${events.length} market(s).`);

  let successCount = 0;
  for (const event of events) {
    console.log(`\n📋 ${event.source_title?.slice(0, 60)}`);
    let hawk, dove;
    try {
      hawk = await generateSideBriefing("HAWK", event, groq, GROQ_API_KEY, CEREBRAS_API_KEY);
      console.log(`  🦅 Hawk (${hawk.conviction}%): ${hawk.reasoning}`);
      dove = await generateSideBriefing("DOVE", event, groq, GROQ_API_KEY, CEREBRAS_API_KEY);
      console.log(`  🕊️ Dove (${dove.conviction}%): ${dove.reasoning}`);
    } catch (e) {
      console.log(`  ⚠️ Briefing generation failed (${e.message}) — will retry next run.`);
      continue;
    }

    const { error: updateError } = await adminSupabase
      .from("events")
      .update({
        hawk_reasoning: hawk.reasoning,
        dove_reasoning: dove.reasoning,
        hawk_conviction: hawk.conviction,
        dove_conviction: dove.conviction,
        briefing_generated_at: new Date().toISOString(),
      })
      .eq("id", event.id);

    if (updateError) {
      console.log(`  ⚠️ Supabase write failed for ${event.id} (${updateError.message}) — will retry next run.`);
      continue;
    }
    successCount++;
  }

  console.log(`\nDone. ${successCount}/${events.length} briefing(s) generated this run.`);
}

main().catch((err) => {
  console.error("Fatal error in generate-briefings.js:", err);
  process.exit(1);
});
