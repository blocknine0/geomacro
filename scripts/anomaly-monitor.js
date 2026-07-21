// scripts/anomaly-monitor.js
// প্রতি ১৫ মিনিটে চলে (security-monitor.yml দেখুন) — অস্বাভাবিক activity দেখলে
// contract pause + Telegram alert পাঠায়
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

// 🛡️ two-tier থ্রেশহোল্ড — WARN (Telegram alert, pause না) আর CRITICAL
// (alert + auto-pause, শুধু সত্যিকারের exploit-level spike-এর জন্য)। দেখুন
// আগের সেশনের নোট: organic ট্রাফিক (গ্রান্ট ডেমো, viral মুহূর্ত, batch
// resolve-এর পরে অনেকে একসাথে claim) legitimate-ই একটা fixed low threshold
// ছাড়িয়ে যেতে পারত, যেটা পুরো contract-কে সবার জন্য বন্ধ করে দিত।
const THRESHOLDS = {
  MAX_SINGLE_CLAIM_USDC: { warn: 5000, critical: 25000 },
  MAX_CLAIMS_PER_BLOCK: { warn: 15, critical: 60 },
  MAX_DISPUTES_PER_HOUR: { warn: 5, critical: 15 },
  MAX_STAKES_FROM_ONE_WALLET: { warn: 20, critical: 60 }, // per-wallet — 100 জন আলাদা ইউজার stake করলে এটা এমনিতেই trigger হয় না
  SCAN_BLOCKS: 100,
};

const MAX_RATE_LIMIT_RETRIES = Number(process.env.RPC_MAX_RETRIES || 5);
const BASE_BACKOFF_MS = 2000;
const MAX_BACKOFF_MS = 30 * 1000; // এই script ঘন ঘন (১৫ মিনিটে একবার) চলে বলে max backoff একটু কম রাখা হলো
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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

// 🛡️ NEW: বাকি স্ক্রিপ্টগুলোর মতোই rotating multi-RPC manager। rate-limit hit
// করলে সাথে সাথে অন্য configured endpoint-এ switch করে, একই endpoint-এ wait
// করে বসে থাকার বদলে — এই স্ক্রিপ্ট প্রতি ১৫ মিনিটে চলে বলে একটা rate-limit hit-এই
// পুরো scan crash করে "monitoring is DOWN" false alarm পাঠাচ্ছিল আগে।
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
      console.log(`  ⏳ RPC rate limited on ${label} (all ${rpcManager?.count() ?? 1} endpoint(s) tried). Waiting ${Math.round((backoff + jitter) / 1000)}s before next sweep...`);
      await delay(backoff + jitter);
      sweepAttempt = 0;
      rpcManager?.rotate();
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

// 🛡️ pause() send — সেন্ডটা rate-limit-এর জন্য rotate করে (একবারে একটাই
// endpoint active, তাই duplicate-broadcast risk নেই), আর retry-র আগে
// contract আগে থেকেই paused কিনা রিচেক করে, যাতে আগের attempt phantom-broadcast
// হয়ে থাকলে duplicate pause() call পাঠানো না হয়।
async function pauseContract(getWriteContract, getReadContract, writeRpcManager, reason) {
  try {
    const isPaused = await callRpcWithBackoff(() => getReadContract().paused(), "paused()", writeRpcManager);
    if (isPaused) {
      console.log("[monitor] Contract already paused.");
      return;
    }
    console.log(`[monitor] PAUSING contract: ${reason}`);

    let tx;
    let nonceAttempt = 0;
    let sweepAttempt = 0;
    let rateLimitAttempt = 0;
    const MAX_NONCE_RETRIES = 3;
    const endpointCount = writeRpcManager.count();
    const MAX_TOTAL_RATE_LIMIT_ATTEMPTS = 6 * Math.max(1, endpointCount);

    while (true) {
      try {
        tx = await getWriteContract().pause();
        break;
      } catch (sendErr) {
        const isNonceRace = sendErr.code === "NONCE_EXPIRED" || sendErr.code === "REPLACEMENT_UNDERPRICED";
        const isRateLimited = isRpcRateLimitError(sendErr);

        if ((isNonceRace || isRateLimited) && (nonceAttempt < MAX_NONCE_RETRIES || rateLimitAttempt < MAX_TOTAL_RATE_LIMIT_ATTEMPTS)) {
          try {
            const stillUnpaused = !(await getReadContract().paused());
            if (!stillUnpaused) {
              console.log("[monitor] Contract was already paused by an earlier (phantom) broadcast — no duplicate send needed.");
              return;
            }
          } catch {
            // status-check itself failed too — fall through to normal retry logic
          }
        }

        if (isNonceRace && nonceAttempt < MAX_NONCE_RETRIES) {
          nonceAttempt++;
          const wait = 1500 * nonceAttempt;
          console.log(`  ⏳ Nonce/mempool race on pause() (${sendErr.code}), attempt ${nonceAttempt}/${MAX_NONCE_RETRIES}. Waiting ${wait}ms...`);
          await delay(wait);
          continue;
        }

        if (isRateLimited && rateLimitAttempt < MAX_TOTAL_RATE_LIMIT_ATTEMPTS) {
          rateLimitAttempt++;
          if (writeRpcManager.hasMultiple() && sweepAttempt < endpointCount - 1) {
            sweepAttempt++;
            writeRpcManager.rotate();
            continue;
          }
          const backoff = Math.min(BASE_BACKOFF_MS * 2 ** Math.floor(rateLimitAttempt / endpointCount), MAX_BACKOFF_MS);
          const jitter = Math.random() * 500;
          console.log(`  ⏳ RPC rate limited sending pause() — all ${endpointCount} endpoint(s) tried. Waiting ${Math.round((backoff + jitter) / 1000)}s...`);
          await delay(backoff + jitter);
          sweepAttempt = 0;
          writeRpcManager.rotate();
          continue;
        }

        throw sendErr;
      }
    }

    await callRpcWithBackoff(() => tx.wait(), "tx.wait(pause)", writeRpcManager);
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

async function checkThreshold(getWriteContract, getReadContract, writeRpcManager, { value, warn, critical, describe }) {
  if (value > critical) {
    await pauseContract(getWriteContract, getReadContract, writeRpcManager, describe(value, "critical"));
    return "paused";
  }
  if (value > warn) {
    await sendTelegramAlert(describe(value, "warn"), { severity: "warn" });
    return "warned";
  }
  return "ok";
}

async function main() {
  const {
    ARC_RPC_URL, ARC_RPC_URL_2, ARC_RPC_URL_3, ARC_RPC_URL_4, ARC_RPC_URL_5,
    GUARDIAN_PRIVATE_KEY, APP_SUPABASE_URL, APP_SUPABASE_SERVICE_ROLE_KEY,
  } = process.env;
  if (!ARC_RPC_URL || !GUARDIAN_PRIVATE_KEY) throw new Error("Missing env: ARC_RPC_URL, GUARDIAN_PRIVATE_KEY");

  // 🛡️ NEW: same 5-endpoint rotating pool as the other scripts.
  const publicFallbackUrl = ARC_RPC_URL_5 || "https://rpc.testnet.arc.network";
  const rpcUrls = [ARC_RPC_URL, ARC_RPC_URL_2, ARC_RPC_URL_3, ARC_RPC_URL_4, publicFallbackUrl];
  const readRpcManager = new RpcManager(rpcUrls, "read");
  const writeRpcManager = new RpcManager(rpcUrls, "write");
  console.log(`Configured ${readRpcManager.count()} RPC endpoint(s) for automatic failover.`);

  const getWriteContract = () => {
    const guardian = new ethers.Wallet(GUARDIAN_PRIVATE_KEY, writeRpcManager.current());
    return new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, guardian);
  };
  const getReadContract = () => new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, readRpcManager.current());

  const currentBlock = await callRpcWithBackoff(() => readRpcManager.current().getBlockNumber(), "getBlockNumber", readRpcManager);
  const fromBlock = currentBlock - THRESHOLDS.SCAN_BLOCKS;

  console.log(`[monitor] Scanning blocks ${fromBlock} → ${currentBlock}`);

  // ১. Large claim check — single very large claim (per-claim size, not count)
  const claimedFilter = getReadContract().filters.Claimed();
  const claimedEvents = await callRpcWithBackoff(
    () => getReadContract().queryFilter(claimedFilter, fromBlock, currentBlock),
    "queryFilter(Claimed)",
    readRpcManager,
  );

  for (const ev of claimedEvents) {
    const amountUsdc = Number(ethers.formatUnits(ev.args[2], 18));
    const result = await checkThreshold(getWriteContract, getReadContract, writeRpcManager, {
      value: amountUsdc,
      warn: THRESHOLDS.MAX_SINGLE_CLAIM_USDC.warn,
      critical: THRESHOLDS.MAX_SINGLE_CLAIM_USDC.critical,
      describe: (v, sev) => sev === "critical"
        ? `Unusually large claim: ${v} USDC by ${ev.args[1]} in market ${ev.args[0]}`
        : `Large claim: ${v} USDC by ${ev.args[1]} in market ${ev.args[0]} — above warn threshold (${THRESHOLDS.MAX_SINGLE_CLAIM_USDC.warn}), below auto-pause threshold. Likely a legitimate big winner — no action taken, just flagging for awareness.`,
    });
    if (result === "paused") return;
  }

  // ২. Claims per block check
  const claimsByBlock = {};
  for (const ev of claimedEvents) {
    claimsByBlock[ev.blockNumber] = (claimsByBlock[ev.blockNumber] || 0) + 1;
  }
  for (const [block, count] of Object.entries(claimsByBlock)) {
    const result = await checkThreshold(getWriteContract, getReadContract, writeRpcManager, {
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
  const disputeFilter = getReadContract().filters.Disputed();
  const disputeEvents = await callRpcWithBackoff(
    () => getReadContract().queryFilter(disputeFilter, fromBlock, currentBlock),
    "queryFilter(Disputed)",
    readRpcManager,
  );
  {
    const result = await checkThreshold(getWriteContract, getReadContract, writeRpcManager, {
      value: disputeEvents.length,
      warn: THRESHOLDS.MAX_DISPUTES_PER_HOUR.warn,
      critical: THRESHOLDS.MAX_DISPUTES_PER_HOUR.critical,
      describe: (v, sev) => sev === "critical"
        ? `${v} disputes in last ${THRESHOLDS.SCAN_BLOCKS} blocks — possible spam attack`
        : `${v} disputes in last ${THRESHOLDS.SCAN_BLOCKS} blocks — above warn threshold (${THRESHOLDS.MAX_DISPUTES_PER_HOUR.warn}). Worth a manual look, not necessarily an attack.`,
    });
    if (result === "paused") return;
  }

  // ৪. Stake spam from single wallet
  const stakeFilter = getReadContract().filters.Staked();
  const stakeEvents = await callRpcWithBackoff(
    () => getReadContract().queryFilter(stakeFilter, fromBlock, currentBlock),
    "queryFilter(Staked)",
    readRpcManager,
  );
  const stakesByWallet = {};
  for (const ev of stakeEvents) {
    const wallet = ev.args[1].toLowerCase();
    stakesByWallet[wallet] = (stakesByWallet[wallet] || 0) + 1;
  }
  for (const [wallet, count] of Object.entries(stakesByWallet)) {
    const result = await checkThreshold(getWriteContract, getReadContract, writeRpcManager, {
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
