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

// Anomaly thresholds
const THRESHOLDS = {
  MAX_SINGLE_CLAIM_USDC: 5000,        // একটা claim এ ৫০০০ USDC এর বেশি
  MAX_CLAIMS_PER_BLOCK: 10,           // একটা block এ ১০ এর বেশি claim
  MAX_DISPUTES_PER_HOUR: 5,           // ঘণ্টায় ৫ এর বেশি dispute
  MAX_STAKES_FROM_ONE_WALLET: 20,     // একটা wallet থেকে ঘণ্টায় ২০ এর বেশি stake
  SCAN_BLOCKS: 100,                   // শেষ ১০০ block scan করবে
};

async function sendTelegramAlert(message) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    console.warn("[alert] Telegram not configured, logging only:", message);
    return;
  }
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: `🚨 GEOMACRO SECURITY ALERT\n\n${message}\n\nTime: ${new Date().toISOString()}`,
        parse_mode: "HTML",
      }),
    });
  } catch (err) {
    console.error("[alert] Telegram send failed:", err.message);
  }
}

async function pauseContract(wallet, contract, reason) {
  try {
    const isPaused = await contract.paused();
    if (isPaused) {
      console.log("[monitor] Contract already paused.");
      return;
    }
    console.log(`[monitor] PAUSING contract: ${reason}`);
    const tx = await contract.pause();
    await tx.wait();
    console.log(`[monitor] Contract paused. TX: ${tx.hash}`);
    await sendTelegramAlert(
      `⛔ CONTRACT AUTO-PAUSED\n\nReason: ${reason}\nTX: ${tx.hash}\n\nManual review required before unpausing.`
    );
  } catch (err) {
    console.error("[monitor] Pause failed:", err.message);
    await sendTelegramAlert(`❌ AUTO-PAUSE FAILED\n\nReason: ${reason}\nError: ${err.message}\n\nMANUAL ACTION REQUIRED IMMEDIATELY`);
  }
}

async function main() {
  const { ARC_RPC_URL, GUARDIAN_PRIVATE_KEY, APP_SUPABASE_URL, APP_SUPABASE_SERVICE_ROLE_KEY } = process.env;
  if (!ARC_RPC_URL || !GUARDIAN_PRIVATE_KEY) throw new Error("Missing env: ARC_RPC_URL, GUARDIAN_PRIVATE_KEY");

  const provider = new ethers.JsonRpcProvider(ARC_RPC_URL);
  const guardian = new ethers.Wallet(GUARDIAN_PRIVATE_KEY, provider);
  const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, guardian);

  const currentBlock = await provider.getBlockNumber();
  const fromBlock = currentBlock - THRESHOLDS.SCAN_BLOCKS;

  console.log(`[monitor] Scanning blocks ${fromBlock} → ${currentBlock}`);

  // ১. Large claim check
  const claimedFilter = contract.filters.Claimed();
  const claimedEvents = await contract.queryFilter(claimedFilter, fromBlock, currentBlock);

  for (const ev of claimedEvents) {
    const amountUsdc = Number(ethers.formatUnits(ev.args[2], 18));
    if (amountUsdc > THRESHOLDS.MAX_SINGLE_CLAIM_USDC) {
      await pauseContract(
        guardian, contract,
        `Unusually large claim: ${amountUsdc} USDC by ${ev.args[1]} in market ${ev.args[0]}`
      );
      return;
    }
  }

  // ২. Claims per block check
  const claimsByBlock = {};
  for (const ev of claimedEvents) {
    claimsByBlock[ev.blockNumber] = (claimsByBlock[ev.blockNumber] || 0) + 1;
  }
  for (const [block, count] of Object.entries(claimsByBlock)) {
    if (count > THRESHOLDS.MAX_CLAIMS_PER_BLOCK) {
      await pauseContract(
        guardian, contract,
        `${count} claims in single block ${block} — possible exploit`
      );
      return;
    }
  }

  // ৩. Dispute spam check
  const disputeFilter = contract.filters.Disputed();
  const disputeEvents = await contract.queryFilter(disputeFilter, fromBlock, currentBlock);
  if (disputeEvents.length > THRESHOLDS.MAX_DISPUTES_PER_HOUR) {
    await pauseContract(
      guardian, contract,
      `${disputeEvents.length} disputes in last ${THRESHOLDS.SCAN_BLOCKS} blocks — possible spam attack`
    );
    return;
  }

  // ৪. Stake spam from single wallet
  const stakeFilter = contract.filters.Staked();
  const stakeEvents = await contract.queryFilter(stakeFilter, fromBlock, currentBlock);
  const stakesByWallet = {};
  for (const ev of stakeEvents) {
    const wallet = ev.args[1].toLowerCase();
    stakesByWallet[wallet] = (stakesByWallet[wallet] || 0) + 1;
  }
  for (const [wallet, count] of Object.entries(stakesByWallet)) {
    if (count > THRESHOLDS.MAX_STAKES_FROM_ONE_WALLET) {
      await pauseContract(
        guardian, contract,
        `Wallet ${wallet} made ${count} stakes in last ${THRESHOLDS.SCAN_BLOCKS} blocks — possible bot attack`
      );
      return;
    }
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

    // claimed positions কিন্তু Supabase-এ duplicate check
    const seen = new Set();
    for (const p of positions ?? []) {
      const key = `${p.wallet_address}:${p.market_id}`;
      if (seen.has(key)) {
        await sendTelegramAlert(
          `⚠️ DUPLICATE CLAIM DETECTED in Supabase\n\nWallet: ${p.wallet_address}\nMarket: ${p.market_id}\n\nInvestigate immediately.`
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
  await sendTelegramAlert(`💀 ANOMALY MONITOR CRASHED\n\nError: ${err.message}\n\nMonitoring is DOWN — manual check required.`);
  process.exit(1);
});
