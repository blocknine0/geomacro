// scripts/anomaly-monitor.js
// প্রতি ৫ মিনিটে চলে — অস্বাভাবিক activity দেখলে contract pause + Telegram alert পাঠায়
import { ethers } from "ethers";
import { createClient } from "@supabase/supabase-js";

const RAW_ADDRESS = process.env.CONTRACT_ADDRESS || "0xC026fDFC40Dcd8F07b6ecFA21b2BF8400Db0FADe";
const CONTRACT_ADDRESS = ethers.getAddress(RAW_ADDRESS.toLowerCase());

const CONTRACT_ABI = [
  "function pause() external",
  "function paused() view returns (bool)",
  "event Claimed(string marketId, address indexed user, uint256 amount)",
  "event Staked(string marketId, address indexed user, uint8 side, uint256 amount)",
  "event Disputed(string marketId, address indexed disputer)",
];

// 🛡️ FIX: প্রতিটা threshold এখন দুই ধাপে ভাগ করা — WARN (Telegram alert পাঠায়,
// contract pause করে না) আর CRITICAL (alert + auto-pause, শুধু সত্যিকারের
// exploit-level spike-এর জন্য)। আগে একটামাত্র fixed threshold ছিল যেটা ছাড়ালেই
// সরাসরি pause হয়ে যেত — কিন্তু organic ব্যবহারকারীর সংখ্যা বাড়লে (গ্রান্ট ডেমো,
// viral মুহূর্ত, বা resolve-markets.js/finalize-markets.js ব্যাচে অনেক market
// resolve করার পরে অনেকে একসাথে claim করলে) legitimate traffic-ই এই সংখ্যা
// ছাড়িয়ে যেতে পারত, আর পুরো contract-টা সব ব্যবহারকারীর জন্য বন্ধ হয়ে যেত —
// একটা false-positive pause, যেটা আসল exploit-এর চেয়ে বেশি ক্ষতিকর।
const THRESHOLDS = {
  MAX_SINGLE_CLAIM_USDC: { warn: 5000, critical: 25000 },
  MAX_CLAIMS_PER_BLOCK: { warn: 15, critical: 60 },       // ছিল শুধু 10 (pause সরাসরি)
  MAX_DISPUTES_PER_HOUR: { warn: 5, critical: 15 },
  MAX_STAKES_FROM_ONE_WALLET: { warn: 20, critical: 60 }, // per-wallet — 100 জন আলাদা ইউজার stake করলে এটা এমনিতেই trigger হয় না
  SCAN_BLOCKS: 100,
};

const MAX_RATE_LIMIT_RETRIES = Number(process.env.RPC_MAX_RETRIES || 5);
const BASE_BACKOFF_MS = 2000;
const MAX_BACKOFF_MS = 30 * 1000;
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function callRpcWithBackoff(fn, label) {
  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (error) {
      const code = error?.error?.code ?? error?.code;
      const message = String(error?.error?.message ?? error?.message ?? "");
      const isRateLimit =
        code === -32007 ||
        code === -32011 ||
        error?.status === 429 ||
        /request limit|rate limit|too many requests/i.test(message);
      if (!isRateLimit || attempt >= MAX_RATE_LIMIT_RETRIES) throw error;
      const backoff = Math.min(BASE_BACKOFF_MS * 2 ** attempt, MAX_BACKOFF_MS);
      const jitter = Math.random() * 500;
      attempt++;
      console.log(`  ⏳ RPC rate limited on ${label} (attempt ${attempt}/${MAX_RATE_LIMIT_RETRIES}). Waiting ${Math.round((backoff + jitter) / 1000)}s...`);
      await delay(backoff + jitter);
    }
  }
}

async function sendTelegramAlert(message, { severity = "critical" } = {}) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  const icon = severity === "warn" ? "⚠️" : "🚨";
  const label = severity === "warn" ? "GEOMACRO ANOMALY WARNING (no action taken)" : "GEOMACRO SECURITY ALERT";
  if (!token || !chatId) {
    console.warn(`[alert:${severity}] Telegram not configured, logging only:`, message);
    return;
  }
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: `${icon} ${label}\n\n${message}\n\nTime: ${new Date().toISOString()}`,
        parse_mode: "HTML",
      }),
    });
  } catch (err) {
    console.error("[alert] Telegram send failed:", err.message);
  }
}

async function pauseContract(wallet, contract, reason) {
  try {
    const isPaused = await callRpcWithBackoff(() => contract.paused(), "paused()");
    if (isPaused) {
      console.log("[monitor] Contract already paused.");
      return;
    }
    console.log(`[monitor] PAUSING contract: ${reason}`);
    let tx;
    let sendAttempt = 0;
    const MAX_SEND_RETRIES = 3;
    while (true) {
      try {
        tx = await contract.pause();
        break;
      } catch (sendErr) {
        const isNonceRace = sendErr.code === "NONCE_EXPIRED" || sendErr.code === "REPLACEMENT_UNDERPRICED";
        if (!isNonceRace || sendAttempt >= MAX_SEND_RETRIES) throw sendErr;
        sendAttempt++;
        const wait = 1500 * sendAttempt;
        console.log(`  ⏳ Nonce/mempool race on pause() (${sendErr.code}), attempt ${sendAttempt}/${MAX_SEND_RETRIES}. Waiting ${wait}ms...`);
        await delay(wait);
      }
    }
    await callRpcWithBackoff(() => tx.wait(), "tx.wait(pause)");
    console.log(`[monitor] Contract paused. TX: ${tx.hash}`);
    await sendTelegramAlert(
      `⛔ CONTRACT AUTO-PAUSED\n\nReason: ${reason}\nTX: ${tx.hash}\n\nManual review required before unpausing.`,
      { severity: "critical" },
    );
  } catch (err) {
    console.error("[monitor] Pause failed:", err.message);
    await sendTelegramAlert(`❌ AUTO-PAUSE FAILED\n\nReason: ${reason}\nError: ${err.message}\n\nMANUAL ACTION REQUIRED IMMEDIATELY`, { severity: "critical" });
  }
}

// 🛡️ NEW: shared two-tier check — warn (alert only) below `critical`, actual
// pause only past `critical`. Keeps `pauseContract`'s early-return semantics
// (caller should `return` after this if it paused) but no longer punishes
// organic traffic spikes with a full outage.
async function checkThreshold(guardian, contract, { value, warn, critical, describe }) {
  if (value > critical) {
    await pauseContract(guardian, contract, describe(value, "critical"));
    return "paused";
  }
  if (value > warn) {
    await sendTelegramAlert(describe(value, "warn"), { severity: "warn" });
    return "warned";
  }
  return "ok";
}

async function main() {
  const { ARC_RPC_URL, GUARDIAN_PRIVATE_KEY, APP_SUPABASE_URL, APP_SUPABASE_SERVICE_ROLE_KEY } = process.env;
  if (!ARC_RPC_URL || !GUARDIAN_PRIVATE_KEY) throw new Error("Missing env: ARC_RPC_URL, GUARDIAN_PRIVATE_KEY");

  const provider = new ethers.JsonRpcProvider(ARC_RPC_URL);
  const guardian = new ethers.Wallet(GUARDIAN_PRIVATE_KEY, provider);
  const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, guardian);

  const currentBlock = await callRpcWithBackoff(() => provider.getBlockNumber(), "getBlockNumber");
  const fromBlock = currentBlock - THRESHOLDS.SCAN_BLOCKS;

  console.log(`[monitor] Scanning blocks ${fromBlock} → ${currentBlock}`);

  // ১. Large claim check — single very large claim (per-claim size, not count)
  const claimedFilter = contract.filters.Claimed();
  const claimedEvents = await callRpcWithBackoff(
    () => contract.queryFilter(claimedFilter, fromBlock, currentBlock),
    "queryFilter(Claimed)",
  );

  for (const ev of claimedEvents) {
    const amountUsdc = Number(ethers.formatUnits(ev.args[2], 18));
    const result = await checkThreshold(guardian, contract, {
      value: amountUsdc,
      warn: THRESHOLDS.MAX_SINGLE_CLAIM_USDC.warn,
      critical: THRESHOLDS.MAX_SINGLE_CLAIM_USDC.critical,
      describe: (v, sev) => sev === "critical"
        ? `Unusually large claim: ${v} USDC by ${ev.args[1]} in market ${ev.args[0]}`
        : `Large claim: ${v} USDC by ${ev.args[1]} in market ${ev.args[0]} — above warn threshold (${THRESHOLDS.MAX_SINGLE_CLAIM_USDC.warn}), below auto-pause threshold. Likely a legitimate big winner — no action taken, just flagging for awareness.`,
    });
    if (result === "paused") return;
  }

  // ২. Claims per block check — this is the one most likely to catch
  // legitimate simultaneous activity (e.g. many users claiming right after a
  // batch of markets finalize), so warn is generous and critical is set well
  // above any plausible organic burst.
  const claimsByBlock = {};
  for (const ev of claimedEvents) {
    claimsByBlock[ev.blockNumber] = (claimsByBlock[ev.blockNumber] || 0) + 1;
  }
  for (const [block, count] of Object.entries(claimsByBlock)) {
    const result = await checkThreshold(guardian, contract, {
      value: count,
      warn: THRESHOLDS.MAX_CLAIMS_PER_BLOCK.warn,
      critical: THRESHOLDS.MAX_CLAIMS_PER_BLOCK.critical,
      describe: (v, sev) => sev === "critical"
        ? `${v} claims in single block ${block} — possible exploit`
        : `${v} claims in single block ${block} — above warn threshold (${THRESHOLDS.MAX_CLAIMS_PER_BLOCK.warn}). Could be organic (many users claiming after a resolve-markets.js/finalize-markets.js batch) — no action taken, just flagging.`,
    });
    if (result === "paused") return;
  }

  // ৩. Dispute spam check
  const disputeFilter = contract.filters.Disputed();
  const disputeEvents = await callRpcWithBackoff(
    () => contract.queryFilter(disputeFilter, fromBlock, currentBlock),
    "queryFilter(Disputed)",
  );
  {
    const result = await checkThreshold(guardian, contract, {
      value: disputeEvents.length,
      warn: THRESHOLDS.MAX_DISPUTES_PER_HOUR.warn,
      critical: THRESHOLDS.MAX_DISPUTES_PER_HOUR.critical,
      describe: (v, sev) => sev === "critical"
        ? `${v} disputes in last ${THRESHOLDS.SCAN_BLOCKS} blocks — possible spam attack`
        : `${v} disputes in last ${THRESHOLDS.SCAN_BLOCKS} blocks — above warn threshold (${THRESHOLDS.MAX_DISPUTES_PER_HOUR.warn}). Worth a manual look, not necessarily an attack.`,
    });
    if (result === "paused") return;
  }

  // ৪. Stake spam from single wallet (per-wallet count — many DIFFERENT
  // users staking simultaneously does NOT trigger this at all, only one
  // wallet making many stakes does).
  const stakeFilter = contract.filters.Staked();
  const stakeEvents = await callRpcWithBackoff(
    () => contract.queryFilter(stakeFilter, fromBlock, currentBlock),
    "queryFilter(Staked)",
  );
  const stakesByWallet = {};
  for (const ev of stakeEvents) {
    const wallet = ev.args[1].toLowerCase();
    stakesByWallet[wallet] = (stakesByWallet[wallet] || 0) + 1;
  }
  for (const [wallet, count] of Object.entries(stakesByWallet)) {
    const result = await checkThreshold(guardian, contract, {
      value: count,
      warn: THRESHOLDS.MAX_STAKES_FROM_ONE_WALLET.warn,
      critical: THRESHOLDS.MAX_STAKES_FROM_ONE_WALLET.critical,
      describe: (v, sev) => sev === "critical"
        ? `Wallet ${wallet} made ${v} stakes in last ${THRESHOLDS.SCAN_BLOCKS} blocks — possible bot attack`
        : `Wallet ${wallet} made ${v} stakes in last ${THRESHOLDS.SCAN_BLOCKS} blocks — above warn threshold (${THRESHOLDS.MAX_STAKES_FROM_ONE_WALLET.warn}). Could be a power user — no action taken.`,
    });
    if (result === "paused") return;
  }

  // ৫. Supabase integrity check — positions vs onchain mismatch
  if (APP_SUPABASE_URL && APP_SUPABASE_SERVICE_ROLE_KEY) {
    const supabase = createClient(APP_SUPABASE_URL, APP_SUPABASE_SERVICE_ROLE_KEY);
    const { data: positions } = await supabase
      .from("positions")
      .select("wallet_address, market_id, status")
      .eq("status", "claimed")
      .order("created_at", { ascending: false })
      .limit(50);

    const seen = new Set();
    for (const p of positions ?? []) {
      const key = `${p.wallet_address}:${p.market_id}`;
      if (seen.has(key)) {
        await sendTelegramAlert(
          `⚠️ DUPLICATE CLAIM DETECTED in Supabase\n\nWallet: ${p.wallet_address}\nMarket: ${p.market_id}\n\nInvestigate immediately.`,
          { severity: "critical" },
        );
        break;
      }
      seen.add(key);
    }
  }

  console.log("[monitor] ✅ All checks passed. System healthy.");
}

main().catch(async (err) => {
  console.error("[monitor] Fatal error:", err.message);
  await sendTelegramAlert(`💀 ANOMALY MONITOR CRASHED\n\nError: ${err.message}\n\nMonitoring is DOWN — manual check required.`, { severity: "critical" });
  process.exit(1);
});
