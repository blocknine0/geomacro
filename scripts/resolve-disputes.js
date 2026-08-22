// scripts/resolve-disputes.js
//
// Picks up DISPUTED markets (raiseDispute() already called on-chain by a
// staked, losing-side user) and runs a 5-agent AI jury against fresh
// evidence, then submits each juror's vote on-chain from its own dedicated
// wallet. AgentArenaV2 auto-settles the dispute once either side reaches a
// 4-of-5 supermajority (submitJuryVote does this internally) — this script
// does not call any separate "resolve" function.
//
// No human review step anywhere in this path, by design.
import { ethers } from "ethers";
import { createClient } from "@supabase/supabase-js";
import Groq from "groq-sdk";
import fetch from "node-fetch";

const RAW_ADDRESS = process.env.CONTRACT_ADDRESS;
if (!RAW_ADDRESS) throw new Error("Missing env: CONTRACT_ADDRESS");
const CONTRACT_ADDRESS = ethers.getAddress(RAW_ADDRESS.toLowerCase());

const MAX_DISPUTES_PER_RUN = Number(process.env.MAX_DISPUTES_PER_RUN || 5);
const MAX_MARKETS_SCANNED_PER_RUN = Number(process.env.MAX_MARKETS_SCANNED_PER_RUN || 100);

const CONTRACT_ABI = [
  "function getMarketFullDetails(string marketId) view returns (uint8 status, uint8 winner, uint8 tentativeWinner, uint256 stakingEndTime, uint256 resolutionTime, uint256 aiResolutionTime, address disputer, uint256 disputeBond, uint256 disputeRaisedAt)",
  "function getDispute(string marketId) view returns (uint256 overturnVotes, uint256 upholdVotes, bool resolved)",
  "function hasJuryVoted(string marketId, address juror) view returns (bool)",
  "function getJuryMembers() view returns (address[5])",
  "function submitJuryVote(string marketId, bool overturn) external",
];

const MULTICALL3_ADDRESS = process.env.MULTICALL3_ADDRESS || "0xcA11bde05977b3631167028862bE2a173976CA11";
const MULTICALL3_ABI = [
  "function aggregate3((address target, bool allowFailure, bytes callData)[] calls) payable returns ((bool success, bytes returnData)[] returnData)",
];

const STATUS = { OPEN: 0, LOCKED: 1, AI_RESOLVED: 2, DISPUTED: 3, FINALIZED: 4 };
const SIDE_LABEL = { 0: "NONE", 1: "HAWK", 2: "DOVE" };

const MAX_RATE_LIMIT_RETRIES = Number(process.env.RESOLVE_MAX_RETRIES || 5);
const BASE_BACKOFF_MS = 2000;
const MAX_BACKOFF_MS = 60 * 1000;
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const RUN_TIME_BUDGET_MS = Number(process.env.RUN_TIME_BUDGET_MS || 4 * 60 * 1000);
const runStartedAt = Date.now();
const timeBudgetExceeded = () => Date.now() - runStartedAt > RUN_TIME_BUDGET_MS;

function isRpcRateLimitError(error) {
  const code = error?.error?.code ?? error?.code;
  const message = String(error?.error?.message ?? error?.message ?? error?.shortMessage ?? "");
  return (
    code === -32007 ||
    code === -32011 ||
    error?.status === 429 ||
    /request limit|rate limit|too many requests|failed to detect network/i.test(message)
  );
}

// Same rotating-endpoint design as the other automation scripts: on a rate
// limit, switch endpoints immediately rather than waiting out a shared,
// sustained cap that a timed backoff wouldn't clear anyway.
class RpcManager {
  constructor(urls, label) {
    this.urls = urls.filter(Boolean);
    if (this.urls.length === 0) throw new Error(`No RPC URLs configured for ${label}`);
    this.label = label;
    this.index = 0;
    this._provider = new ethers.JsonRpcProvider(this.urls[this.index]);
  }
  current() {
    return this._provider;
  }
  rotate() {
    const previous = this.index + 1;
    this.index = (this.index + 1) % this.urls.length;
    this._provider = new ethers.JsonRpcProvider(this.urls[this.index]);
    console.log(`  🔄 Rotated ${this.label} RPC: endpoint #${previous} → #${this.index + 1} of ${this.urls.length}`);
    return this._provider;
  }
  hasMultiple() {
    return this.urls.length > 1;
  }
  count() {
    return this.urls.length;
  }
}

async function callRpcWithBackoff(fn, label, rpcManager) {
  let sweepAttempt = 0;
  let totalAttempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (error) {
      if (!isRpcRateLimitError(error)) throw error;
      totalAttempt++;
      if (rpcManager?.hasMultiple() && sweepAttempt < rpcManager.count() - 1) {
        sweepAttempt++;
        rpcManager.rotate();
        continue;
      }
      if (totalAttempt >= MAX_RATE_LIMIT_RETRIES * Math.max(1, rpcManager?.count() ?? 1)) throw error;
      const backoff = Math.min(BASE_BACKOFF_MS * 2 ** Math.floor(totalAttempt / Math.max(1, rpcManager?.count() ?? 1)), MAX_BACKOFF_MS);
      const jitter = Math.random() * 500;
      console.log(`  ⏳ RPC rate limited on ${label}. Waiting ${Math.round((backoff + jitter) / 1000)}s before next sweep...`);
      await delay(backoff + jitter);
      sweepAttempt = 0;
      rpcManager?.rotate();
    }
  }
}

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
      const jitter = Math.random() * 500;
      attempt++;
      console.log(`  ⏳ Rate limited on ${label} (attempt ${attempt}/${MAX_RATE_LIMIT_RETRIES}). Waiting ${Math.round((backoff + jitter) / 1000)}s...`);
      await delay(backoff + jitter);
    }
  }
}

// ---------------------------------------------------------------------------
// Evidence gathering — deliberately a DIFFERENT source/provider than the
// ingestion pipeline's NewsAPI + Guardian, so a dispute isn't just re-asking
// the same source that may have been wrong in the first place, and so it
// doesn't compete with ingestion for quota.
// ---------------------------------------------------------------------------
async function fetchTavilyEvidence(apiKey, query) {
  if (!apiKey) return null;
  try {
    const response = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        search_depth: "advanced",
        max_results: 5,
        include_answer: true,
      }),
    });
    if (!response.ok) {
      console.log(`  ⚠️ Tavily HTTP ${response.status} for query "${query.slice(0, 60)}..." — jury will proceed on original event data only.`);
      return null;
    }
    const data = await response.json();
    return {
      answer: data.answer || "",
      results: (data.results || []).slice(0, 5).map((r) => ({ title: r.title, content: (r.content || "").slice(0, 400), url: r.url })),
    };
  } catch (e) {
    console.log(`  ⚠️ Tavily fetch failed (${e.message}) — jury will proceed on original event data only.`);
    return null;
  }
}

// ---------------------------------------------------------------------------
// 5-agent jury — independent framings, no juror sees another juror's output
// (avoids anchoring). Providers deliberately split Groq/Cerebras so a single
// provider outage or quota exhaustion doesn't take out the whole jury.
// ---------------------------------------------------------------------------
const JURY_ROLES = [
  { key: "fact_checker", name: "Fact-Checker", provider: "groq", instruction: "Judge strictly and neutrally against the evidence provided. Do not favor either the original AI verdict or the disputer by default — weigh only what the evidence actually supports." },
  { key: "hawk_rearguer", name: "Hawk Re-arguer", provider: "groq", instruction: "Build the strongest possible case that the risk ESCALATED or remains active, using the evidence provided. If the evidence genuinely does not support this, say so honestly rather than forcing the framing." },
  { key: "dove_rearguer", name: "Dove Re-arguer", provider: "cerebras", instruction: "Build the strongest possible case that the risk DE-ESCALATED or was resolved, using the evidence provided. If the evidence genuinely does not support this, say so honestly rather than forcing the framing." },
  { key: "evidence_skeptic", name: "Evidence Skeptic", provider: "cerebras", instruction: "Specifically stress-test the disputer's claim: what would have to be true for the disputer to be wrong? Look for gaps, outdated evidence, or overstatement in what's being argued." },
  { key: "domain_specialist", name: "Domain Specialist", provider: "auto", instruction: "Focus specifically on category-relevant domain context (the event's stated category) that a generalist reading might miss — precedent, typical timelines, or domain-specific signals." },
];

function buildJuryPrompt(role, event, tentativeWinnerLabel, evidence) {
  const summary = (event.summary || "").slice(0, 300);
  const narrative = (event.narrative || "").slice(0, 200);
  const evidenceBlock = evidence
    ? `\nFresh evidence gathered independently for this dispute:\n- Summary: ${evidence.answer || "(no synthesized answer)"}\n${evidence.results.map((r, i) => `- Source ${i + 1} (${r.title}): ${r.content}`).join("\n")}`
    : "\nNo independent fresh evidence could be retrieved — judge based on the original event data only, and weight your confidence accordingly.";

  return `You are one of 5 independent jurors reviewing a disputed prediction-market resolution. You do not see the other jurors' votes or reasoning. Your role: ${role.name}.

${role.instruction}

Original event:
- Category: ${event.category}
- Headline: "${event.source_title}"
- Narrative: "${narrative}"
- Summary: "${summary}"
- Original severity score (0-100): ${event.severity}

The AI resolution engine's original verdict was: ${tentativeWinnerLabel}.
A staker who lost under that verdict has disputed it, arguing the opposite side should have won.
${evidenceBlock}

Task: Decide whether the original AI verdict (${tentativeWinnerLabel}) should be OVERTURNED or UPHELD, based on the evidence above.

Respond STRICTLY in JSON, no markdown fences, no extra text:
{ "verdict": "OVERTURN" | "UPHOLD", "reasoning": "one or two sentence justification grounded in the evidence" }`;
}

function parseJuryVerdict(rawContent) {
  const cleaned = rawContent.replace(/```json|```/g, "").trim();
  const result = JSON.parse(cleaned);
  const overturn = result.verdict === "OVERTURN";
  return { overturn, reasoning: (result.reasoning || "").slice(0, 500) };
}

async function callCerebrasJuror(cerebrasApiKey, prompt) {
  const response = await fetch("https://api.cerebras.ai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${cerebrasApiKey}` },
    body: JSON.stringify({
      model: "llama3.1-8b",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.2,
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
  return parseJuryVerdict(data.choices[0].message.content);
}

async function callGroqJuror(groq, prompt, label) {
  const completion = await callGroqWithBackoff(
    () => groq.chat.completions.create({
      messages: [{ role: "user", content: prompt }],
      model: "openai/gpt-oss-20b",
      reasoning_effort: "low",
      response_format: { type: "json_object" },
      temperature: 0.2,
      max_tokens: 200,
    }),
    label,
  );
  return parseJuryVerdict(completion.choices[0].message.content);
}

async function getJurorVerdict(role, prompt, groq, groqApiKey, cerebrasApiKey) {
  const providers = [];
  if (role.provider === "groq") {
    if (groqApiKey && groq) providers.push("groq");
    if (cerebrasApiKey) providers.push("cerebras");
  } else if (role.provider === "cerebras") {
    if (cerebrasApiKey) providers.push("cerebras");
    if (groqApiKey && groq) providers.push("groq");
  } else {
    if (groqApiKey && groq) providers.push("groq");
    if (cerebrasApiKey) providers.push("cerebras");
  }

  if (providers.length === 0) throw new Error(`No AI provider configured for ${role.name}`);
  let lastError;
  for (const providerName of providers) {
    try {
      if (providerName === "groq") return await callGroqJuror(groq, prompt, role.name);
      return await callCerebrasJuror(cerebrasApiKey, prompt);
    } catch (e) {
      lastError = e;
      console.log(`  ↪ ${providerName} failed for ${role.name} (${e.message}); trying fallback if available.`);
    }
  }
  throw lastError ?? new Error(`No provider could resolve ${role.name}`);
}

// ---------------------------------------------------------------------------
// On-chain vote submission — one dedicated wallet per juror, sequential (not
// simultaneous) to keep nonce handling simple and avoid double-broadcast risk
// across rotating RPC endpoints, matching the pattern used elsewhere.
// ---------------------------------------------------------------------------
async function submitVoteWithRetry(wallet, writeRpcManager, marketId, overturn, jurorLabel) {
  let sweepAttempt = 0;
  let totalRateLimitAttempt = 0;
  const endpointCount = writeRpcManager.count();
  const MAX_TOTAL_RATE_LIMIT_ATTEMPTS = 6 * Math.max(1, endpointCount);

  while (true) {
    try {
      const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, wallet.connect(writeRpcManager.current()));
      const tx = await contract.submitJuryVote(marketId, overturn);
      await tx.wait();
      return tx.hash;
    } catch (sendErr) {
      const isRateLimited = isRpcRateLimitError(sendErr);
      if (isRateLimited && totalRateLimitAttempt < MAX_TOTAL_RATE_LIMIT_ATTEMPTS) {
        totalRateLimitAttempt++;
        if (writeRpcManager.hasMultiple() && sweepAttempt < endpointCount - 1) {
          sweepAttempt++;
          writeRpcManager.rotate();
          continue;
        }
        const backoff = Math.min(BASE_BACKOFF_MS * 2 ** Math.floor(totalRateLimitAttempt / endpointCount), MAX_BACKOFF_MS);
        console.log(`  ⏳ RPC rate limited submitting ${jurorLabel}'s vote on ${marketId}. Waiting ${Math.round(backoff / 1000)}s...`);
        await delay(backoff);
        sweepAttempt = 0;
        writeRpcManager.rotate();
        continue;
      }
      // "Dispute already resolved" (4-of-5 hit by an earlier juror's vote in
      // this same run) is an expected race, not a real failure — surface it
      // distinctly so the caller can log it as such rather than an error.
      if (/already resolved/i.test(String(sendErr?.reason ?? sendErr?.message ?? ""))) {
        const raceErr = new Error("Dispute already resolved by another juror's vote — this is expected, not an error.");
        raceErr.disputeAlreadyResolved = true;
        throw raceErr;
      }
      throw sendErr;
    }
  }
}

async function batchGetMarketDetails(readRpcManager, contractInterface, marketIds) {
  const calls = marketIds.map((marketId) => ({
    target: CONTRACT_ADDRESS,
    allowFailure: true,
    callData: contractInterface.encodeFunctionData("getMarketFullDetails", [marketId]),
  }));
  const results = await callRpcWithBackoff(
    () => {
      const multicall = new ethers.Contract(MULTICALL3_ADDRESS, MULTICALL3_ABI, readRpcManager.current());
      return multicall.aggregate3.staticCall(calls);
    },
    `multicall.aggregate3 (${marketIds.length} markets)`,
    readRpcManager,
  );
  const detailsByMarketId = new Map();
  results.forEach((result, i) => {
    const marketId = marketIds[i];
    if (!result.success) return detailsByMarketId.set(marketId, null);
    try {
      detailsByMarketId.set(marketId, contractInterface.decodeFunctionResult("getMarketFullDetails", result.returnData));
    } catch {
      detailsByMarketId.set(marketId, null);
    }
  });
  return detailsByMarketId;
}

async function main() {
  const {
    APP_SUPABASE_URL, APP_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY,
    ARC_RPC_URL, ARC_RPC_URL_2, ARC_RPC_URL_3, ARC_RPC_URL_4, ARC_RPC_URL_5,
    GROQ_API_KEY, CEREBRAS_API_KEY, TAVILY_API_KEY,
    JURY_PRIVATE_KEY_1, JURY_PRIVATE_KEY_2, JURY_PRIVATE_KEY_3, JURY_PRIVATE_KEY_4, JURY_PRIVATE_KEY_5,
  } = process.env;

  if (!APP_SUPABASE_URL || !APP_SUPABASE_ANON_KEY || !ARC_RPC_URL)
    throw new Error("Missing required env (APP_SUPABASE_URL, APP_SUPABASE_ANON_KEY, ARC_RPC_URL).");
  if (!GROQ_API_KEY && !CEREBRAS_API_KEY)
    throw new Error("At least one jury AI provider is required: GROQ_API_KEY or CEREBRAS_API_KEY.");

  const juryKeys = [JURY_PRIVATE_KEY_1, JURY_PRIVATE_KEY_2, JURY_PRIVATE_KEY_3, JURY_PRIVATE_KEY_4, JURY_PRIVATE_KEY_5];
  if (juryKeys.some((k) => !k)) throw new Error("Missing one or more JURY_PRIVATE_KEY_1..5 env vars.");
  if (!TAVILY_API_KEY) console.warn("⚠️ TAVILY_API_KEY missing — jury will judge on original event data only, no fresh independent evidence.");
  if (!GROQ_API_KEY) console.warn("⚠️ GROQ_API_KEY missing — all jury roles will use Cerebras where available.");
  if (!CEREBRAS_API_KEY) console.warn("⚠️ CEREBRAS_API_KEY missing — all jury roles will use Groq where available.");
  if (!SUPABASE_SERVICE_ROLE_KEY) console.warn("⚠️ SUPABASE_SERVICE_ROLE_KEY missing — jury_votes/disputes table writes will likely be blocked by RLS.");

  const supabase = createClient(APP_SUPABASE_URL, APP_SUPABASE_ANON_KEY);
  const adminSupabase = SUPABASE_SERVICE_ROLE_KEY ? createClient(APP_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY) : supabase;

  const publicFallbackUrl = ARC_RPC_URL_5 || "https://rpc.testnet.arc.network";
  const rpcUrls = [ARC_RPC_URL, ARC_RPC_URL_2, ARC_RPC_URL_3, ARC_RPC_URL_4, publicFallbackUrl];
  const readRpcManager = new RpcManager(rpcUrls, "read");
  const writeRpcManager = new RpcManager(rpcUrls, "write");
  console.log(`Configured ${readRpcManager.count()} RPC endpoint(s) for automatic failover.`);
  console.log(`Using contract address: ${CONTRACT_ADDRESS}`);

  const groq = GROQ_API_KEY ? new Groq({ apiKey: GROQ_API_KEY, timeout: 30 * 1000, maxRetries: 3, fetch }) : null;
  const contractInterface = new ethers.Interface(CONTRACT_ABI);
  const juryWallets = juryKeys.map((key) => new ethers.Wallet(key));

  console.log(`Jury wallets: ${juryWallets.map((w) => w.address).join(", ")}`);

  // Fail fast before spending AI quota: the five signer wallets must exactly
  // match the jury seats configured in the active V2 proxy.
  const juryReadContract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, readRpcManager.current());
  const configuredJury = await callRpcWithBackoff(() => juryReadContract.getJuryMembers(), "getJuryMembers()", readRpcManager);
  const configured = Array.from(configuredJury).map((a) => ethers.getAddress(String(a)).toLowerCase());
  const supplied = juryWallets.map((w) => w.address.toLowerCase());
  const mismatches = supplied.map((a, i) => a === configured[i] ? null : `seat ${i + 1}: contract=${configured[i]} secret=${a}`).filter(Boolean);
  if (mismatches.length) {
    throw new Error(`Jury wallet preflight failed. ${mismatches.join("; ")}`);
  }
  console.log("✅ Jury wallet preflight passed: all 5 secrets match the on-chain jury seats.");

  // Pull a working set of recently-created markets from Supabase and check
  // their on-chain status in one Multicall3 batch, rather than maintaining
  // a separate live "current status" mirror in Supabase (sync-lifecycle.js
  // already does that for the frontend, but this script talks to the chain
  // directly for its own source of truth).
  const { data: candidateEvents, error: fetchError } = await supabase
    .from("events")
    .select("*")
    .eq("market_created", true)
    .order("resolution_at", { ascending: false })
    .limit(MAX_MARKETS_SCANNED_PER_RUN);

  if (fetchError) throw new Error(`Supabase error: ${fetchError.message}`);
  if (!candidateEvents || candidateEvents.length === 0) return console.log("No candidate markets to scan for disputes.");

  const marketIds = candidateEvents.map((e) => `mkt_${e.id}`);
  const eventByMarketId = new Map(candidateEvents.map((e) => [`mkt_${e.id}`, e]));

  const details = await batchGetMarketDetails(readRpcManager, contractInterface, marketIds);
  const disputedMarketIds = marketIds.filter((id) => {
    const d = details.get(id);
    return d && Number(d.status) === STATUS.DISPUTED;
  });

  if (disputedMarketIds.length === 0) return console.log("No markets currently in DISPUTED state.");
  console.log(`Found ${disputedMarketIds.length} disputed market(s), processing up to ${MAX_DISPUTES_PER_RUN} this run.`);

  let processedCount = 0;
  for (const marketId of disputedMarketIds) {
    if (processedCount >= MAX_DISPUTES_PER_RUN) break;
    if (timeBudgetExceeded()) {
      console.log("⏹ Time budget exceeded, stopping early. Remaining disputes will be picked up next run.");
      break;
    }

    const event = eventByMarketId.get(marketId);
    const marketDetails = details.get(marketId);
    if (!event || !marketDetails) continue;

    const tentativeWinnerLabel = SIDE_LABEL[Number(marketDetails.tentativeWinner)] ?? "UNKNOWN";
    console.log(`\n⚖️  ${marketId} — disputed. Original AI verdict: ${tentativeWinnerLabel}. Disputer: ${marketDetails.disputer}`);

    let dispute;
    try {
      const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, readRpcManager.current());
      dispute = await callRpcWithBackoff(() => contract.getDispute(marketId), `getDispute(${marketId})`, readRpcManager);
    } catch (e) {
      console.log(`  ⚠️ Could not read dispute state for ${marketId} (${e.message}) — skipping this run.`);
      continue;
    }
    if (dispute.resolved) {
      console.log(`  ✓ Already resolved on-chain (settled by an earlier run or another juror). Skipping.`);
      continue;
    }

    const query = `${event.source_title} ${event.category} latest update`;
    const evidence = await fetchTavilyEvidence(TAVILY_API_KEY, query);
    if (evidence) console.log(`  📰 Tavily evidence gathered (${evidence.results.length} sources).`);

    for (let i = 0; i < JURY_ROLES.length; i++) {
      const role = JURY_ROLES[i];
      const wallet = juryWallets[i];

      let alreadyVoted;
      try {
        const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, readRpcManager.current());
        alreadyVoted = await callRpcWithBackoff(
          () => contract.hasJuryVoted(marketId, wallet.address),
          `hasJuryVoted(${marketId}, ${role.name})`,
          readRpcManager,
        );
      } catch {
        alreadyVoted = false; // best-effort — submitJuryVote will revert harmlessly if actually already voted
      }
      if (alreadyVoted) {
        console.log(`  ⏭  ${role.name} already voted on ${marketId}, skipping.`);
        continue;
      }

      const prompt = buildJuryPrompt(role, event, tentativeWinnerLabel, evidence);
      let verdict;
      try {
        verdict = await getJurorVerdict(role, prompt, groq, GROQ_API_KEY, CEREBRAS_API_KEY);
      } catch (e) {
        console.log(`  ⚠️ ${role.name} judgment failed (${e.message}) — this juror's vote will be attempted again next run.`);
        continue;
      }

      console.log(`  🗳  ${role.name}: ${verdict.overturn ? "OVERTURN" : "UPHOLD"} — "${verdict.reasoning}"`);

      let txHash;
      try {
        txHash = await submitVoteWithRetry(wallet, writeRpcManager, marketId, verdict.overturn, role.name);
      } catch (e) {
        if (e.disputeAlreadyResolved) {
          console.log(`  ✓ Dispute resolved before ${role.name}'s vote landed (4-of-5 already reached) — expected, not an error.`);
          break;
        }
        console.log(`  ⚠️ Failed to submit ${role.name}'s vote for ${marketId} (${e.message}) — will retry next run.`);
        continue;
      }
      console.log(`  ✅ ${role.name}'s vote submitted: ${txHash}`);

      const { error: voteInsertError } = await adminSupabase.from("jury_votes").upsert({
        market_id: marketId,
        juror_role: role.key,
        juror_wallet: wallet.address,
        verdict: verdict.overturn ? "OVERTURN" : "UPHOLD",
        reasoning: verdict.reasoning,
        tx_hash: txHash,
        evidence_count: evidence?.results?.length ?? null,
      }, { onConflict: "market_id,juror_wallet" });
      // Non-fatal by design: on-chain vote is the source of truth, Supabase
      // is only a transparency mirror for the frontend council page — if
      // this table doesn't exist yet (before the Phase 4 migration runs),
      // don't let it block the on-chain vote that already succeeded.
      if (voteInsertError) console.log(`  ⚠️ Supabase jury_votes insert failed (${voteInsertError.message}) — vote is on-chain regardless.`);
    }

    // Keep the Supabase transparency mirror synchronized with the actual
    // contract state. The frontend still treats chain state as authoritative.
    try {
      const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, readRpcManager.current());
      const finalDispute = await callRpcWithBackoff(() => contract.getDispute(marketId), `getDispute-final(${marketId})`, readRpcManager);
      const overturnVotes = Number(finalDispute.overturnVotes ?? finalDispute[0]);
      const upholdVotes = Number(finalDispute.upholdVotes ?? finalDispute[1]);
      const resolved = Boolean(finalDispute.resolved ?? finalDispute[2]);
      const finalVerdict = resolved ? (overturnVotes >= 4 ? "OVERTURNED" : upholdVotes >= 4 ? "UPHELD" : "INCONCLUSIVE") : null;
      const { error: mirrorError } = await adminSupabase.from("market_disputes").update({
        overturn_votes: overturnVotes,
        uphold_votes: upholdVotes,
        resolved,
        final_verdict: finalVerdict,
        resolved_at: resolved ? new Date().toISOString() : null,
      }).eq("market_id", marketId);
      if (mirrorError) console.log(`  ⚠️ market_disputes mirror update failed (${mirrorError.message})`);
    } catch (mirrorErr) {
      console.log(`  ⚠️ Could not refresh dispute mirror for ${marketId} (${mirrorErr.message})`);
    }

    processedCount++;
  }

  console.log(`\nDone. Processed ${processedCount} disputed market(s) this run.`);
}

main().catch((err) => {
  console.error("Fatal error in resolve-disputes.js:", err);
  process.exit(1);
});
