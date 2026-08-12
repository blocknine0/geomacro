// scripts/sync-stakes.js
// onchain Staked events পড়ে Supabase positions table-এ missing entries insert করে
import { ethers } from "ethers";
import { createClient } from "@supabase/supabase-js";

const RAW_ADDRESS = process.env.CONTRACT_ADDRESS || "0xC026fDFC40Dcd8F07b6ecFA21b2BF8400Db0FADe";
const CONTRACT_ADDRESS = ethers.getAddress(RAW_ADDRESS.toLowerCase());

// 🆕 Dual-contract transition (mirrors sync-lifecycle.js / resolve-markets.js /
// finalize-markets.js): unlike those scripts, this one doesn't read
// market_address per-row — it scans Staked EVENTS directly from a contract
// address over a block range. So instead of per-market routing, it scans
// BOTH contracts, each with its own checkpoint, and simply does nothing for
// the V2 side until CONTRACT_ADDRESS actually differs from OLD_CONTRACT_ADDRESS
// (same "identical addresses pre-cutover" guard sync-lifecycle.js uses).
const OLD_CONTRACT_ADDRESS = ethers.getAddress(
  (process.env.OLD_CONTRACT_ADDRESS || "0xC026fDFC40Dcd8F07b6ecFA21b2BF8400Db0FADe").toLowerCase()
);
const v2CutoverActive = CONTRACT_ADDRESS.toLowerCase() !== OLD_CONTRACT_ADDRESS.toLowerCase();

const DEPLOY_BLOCK = Number(process.env.DEPLOY_BLOCK || 0);
// V2 has its own deploy block, later than V1's — only required once cutover
// is actually active, so this doesn't break pre-cutover runs.
const DEPLOY_BLOCK_V2 = Number(process.env.DEPLOY_BLOCK_V2 || 0);

// DEPLOY_BLOCK missing/0 hole silently pura chain (block 0) theke scan shuru na kore
// loudly fail korao — noile RPC rate-limit-e giye cryptic error dey (etai age hoyechilo).
// Eta sudhu FIRST-EVER run-e kaje lage (jokhon sync_state-e kono row thake na);
// pore theke script nijer last-synced checkpoint theke resume kore.
if (!DEPLOY_BLOCK || DEPLOY_BLOCK < 1000) {
  throw new Error(
    `DEPLOY_BLOCK missing or suspiciously low (got: ${process.env.DEPLOY_BLOCK}). ` +
    `Set the "DEPLOY_BLOCK" repo variable (Settings → Secrets and variables → Actions → Variables) ` +
    `to the contract's actual deployment block (~49000000) before running this script. ` +
    `Refusing to scan from block 0 — that will exhaust RPC rate limits.`
  );
}
if (v2CutoverActive && (!DEPLOY_BLOCK_V2 || DEPLOY_BLOCK_V2 < 1000)) {
  throw new Error(
    `CONTRACT_ADDRESS differs from OLD_CONTRACT_ADDRESS (V2 cutover is active) but ` +
    `DEPLOY_BLOCK_V2 is missing or suspiciously low (got: ${process.env.DEPLOY_BLOCK_V2}). ` +
    `Set it to the AgentArenaProxy's actual deployment block before this script can scan V2 stakes.`
  );
}

const REORG_SAFETY_BLOCKS = 50; // last checkpoint theke ektu piche giye re-scan koro, testnet reorg-safety
const CHUNK_SIZE = 9000;
const CHUNK_DELAY_MS = 400; // consecutive chunk-er majhe chhoto pause, burst rate-limit avoid korte

const CONTRACT_ABI = [
  "event Staked(string marketId, address indexed user, uint8 side, uint256 amount)",
];
const SIDE_MAP = { 1: "HAWK", 2: "DOVE" };

// src/lib/arc.ts-er ARC_TESTNET_RPC_URLS + FallbackProvider pattern-er sathe consistent —
// ekta RPC rate-limit/down hole onnota-y transparently failover kore.
// 🛡️ 5-endpoint rotation — same pattern resolve-markets.js/finalize-markets.js/
// anomaly-monitor.js use kore (ARC_RPC_URL through ARC_RPC_URL_4, plus a public
// fallback as the 5th). Age eta shudhu 3-ta hardcoded URL use korto ar
// ARC_RPC_URL_2/3/4 secrets completely ignore korto — fixed.
const publicFallbackUrl = process.env.ARC_RPC_URL_5 || "https://rpc.testnet.arc.network";
const RPC_URLS = [
  process.env.ARC_RPC_URL,
  process.env.ARC_RPC_URL_2,
  process.env.ARC_RPC_URL_3,
  process.env.ARC_RPC_URL_4,
  publicFallbackUrl,
]
  .filter(Boolean)
  .filter((url, i, arr) => arr.indexOf(url) === i);

function buildProvider() {
  if (RPC_URLS.length === 1) return new ethers.JsonRpcProvider(RPC_URLS[0]);
  const providers = RPC_URLS.map((url) => new ethers.JsonRpcProvider(url));
  return new ethers.FallbackProvider(
    providers.map((provider, i) => ({ provider, priority: i, stallTimeout: 2000 })),
  );
}

// agent-arena.ts-er withRpcRetry() theke port kora — same rate-limit detection + exponential backoff
async function withRpcRetry(fn, { retries = 6, baseDelayMs = 1500 } = {}) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastError = e;
      const message = String(e?.message ?? e);
      const code = e?.info?.error?.code ?? e?.error?.code ?? e?.code;
      const isRateLimited =
        code === -32011 || code === -32005 ||
        message.includes("429") || message.includes("rate limit") ||
        message.includes("request limit") || message.includes("Too Many Requests");
      if (!isRateLimited || attempt === retries) throw e;
      const delay = baseDelayMs * 2 ** attempt;
      console.warn(`  ⏳ rate limited, retrying in ${delay}ms (attempt ${attempt + 1}/${retries})`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw lastError;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function getStartBlock(supabase, syncKey, deployBlock) {
  const { data, error } = await supabase
    .from("sync_state")
    .select("last_synced_block")
    .eq("key", syncKey)
    .maybeSingle();

  if (error) {
    // sync_state table na thakle (migration run kora hoy nai) — DEPLOY_BLOCK diye fallback,
    // kintu warn koro jate clear thake table create korte hobe.
    console.warn(`  ⚠ [${syncKey}] Could not read sync_state (${error.message}). Falling back to deploy block. ` +
      `Run the sync_state_migration.sql if you haven't yet.`);
    return deployBlock;
  }

  if (!data) {
    console.log(`  [${syncKey}] No checkpoint found yet — first run, starting from deploy block (${deployBlock})`);
    return deployBlock;
  }

  const resumeFrom = Math.max(deployBlock, data.last_synced_block - REORG_SAFETY_BLOCKS);
  console.log(`  [${syncKey}] Resuming from checkpoint: block ${data.last_synced_block} (rescanning last ${REORG_SAFETY_BLOCKS} blocks for safety → starting at ${resumeFrom})`);
  return resumeFrom;
}

async function saveCheckpoint(supabase, syncKey, block) {
  const { error } = await supabase
    .from("sync_state")
    .upsert({ key: syncKey, last_synced_block: block, updated_at: new Date().toISOString() });
  if (error) {
    console.warn(`  ⚠ [${syncKey}] Could not save checkpoint (${error.message}). Next run will re-scan from the old checkpoint — safe, just slower.`);
  } else {
    console.log(`  ✓ [${syncKey}] Checkpoint saved: ${block}`);
  }
}

/**
 * Scans Staked events for ONE contract address over its own checkpoint, and
 * inserts any missing positions rows. Used once for the legacy V1 contract
 * and once for V2 — each with an independent sync_state row, since their
 * event histories live on different addresses with different deploy blocks.
 */
async function syncContract({ label, syncKey, contractAddress, deployBlock, provider, supabase }) {
  const contract = new ethers.Contract(contractAddress, CONTRACT_ABI, provider);

  const currentBlock = await withRpcRetry(() => provider.getBlockNumber());
  const startBlock = await getStartBlock(supabase, syncKey, deployBlock);
  console.log(`\n[${label}] Current block: ${currentBlock}, scanning from: ${startBlock} (contract ${contractAddress})`);

  if (startBlock > currentBlock) {
    console.log(`  [${label}] Already caught up. Done.`);
    return;
  }

  // 10,000 block limit এড়াতে chunked scanning, প্রতিটি chunk retry-protected
  const filter = contract.filters.Staked();
  let events = [];
  for (let from = startBlock; from <= currentBlock; from += CHUNK_SIZE) {
    const to = Math.min(from + CHUNK_SIZE - 1, currentBlock);
    process.stdout.write(`  [${label}] Scanning blocks ${from} → ${to}...`);
    const chunk = await withRpcRetry(() => contract.queryFilter(filter, from, to));
    events.push(...chunk);
    process.stdout.write(` ${chunk.length} events\n`);
    await sleep(CHUNK_DELAY_MS);
  }
  console.log(`  [${label}] Total: ${events.length} Staked event(s) found in this range.`);

  let inserted = 0, skipped = 0, failed = 0;
  let earliestFailedBlock = null;

  for (const ev of events) {
    const marketId = ev.args[0];
    const userAddress = ev.args[1].toLowerCase();
    const sideCode = Number(ev.args[2]);
    const amount = ev.args[3];
    const side = SIDE_MAP[sideCode];

    if (!side) {
      console.log(`  [${label}] Skip: unknown side code ${sideCode} for ${marketId}`);
      skipped++;
      continue;
    }

    // "mkt_uuid" → "uuid"
    const eventDbId = marketId.replace(/^mkt_/, "");

    // events table-এ আছে কিনা check
    const { data: eventRow, error: eventLookupErr } = await supabase
      .from("events")
      .select("id")
      .eq("id", eventDbId)
      .maybeSingle();

    if (eventLookupErr) {
      // Transient Supabase error != "event doesn't exist". Treating this as a
      // skip would silently drop a real onchain stake forever, since the
      // checkpoint advances past this block once the run completes. Count
      // it as failed instead, so it shows up loudly and can be re-run via
      // auto-recovery.yml (this event's block stays behind the checkpoint
      // only if we throw — logging + failing the run is the safe choice).
      console.error(`  ❌ [${label}] Could not check events table for ${eventDbId}: ${eventLookupErr.message}`);
      failed++;
      earliestFailedBlock = earliestFailedBlock === null ? ev.blockNumber : Math.min(earliestFailedBlock, ev.blockNumber);
      continue;
    }

    if (!eventRow) {
      console.log(`  [${label}] Skip: event ${eventDbId} not in Supabase`);
      skipped++;
      continue;
    }

    // already আছে কিনা check
    const { data: existing, error: existingLookupErr } = await supabase
      .from("positions")
      .select("market_id")
      .eq("wallet_address", userAddress)
      .eq("market_id", eventDbId)
      .maybeSingle();

    if (existingLookupErr) {
      console.error(`  ❌ [${label}] Could not check existing position for ${userAddress} × ${eventDbId}: ${existingLookupErr.message}`);
      failed++;
      earliestFailedBlock = earliestFailedBlock === null ? ev.blockNumber : Math.min(earliestFailedBlock, ev.blockNumber);
      continue;
    }

    if (existing) {
      console.log(`  [${label}] Skip: ${userAddress} × ${eventDbId} already exists`);
      skipped++;
      continue;
    }

    const { error } = await supabase.from("positions").insert({
      wallet_address: userAddress,
      market_id: eventDbId,
      side,
      staked_amount_raw: amount.toString(),
      status: "active",
    });

    if (error) {
      console.error(`  ❌ [${label}] ${userAddress} × ${eventDbId}: ${error.message}`);
      failed++;
      earliestFailedBlock = earliestFailedBlock === null ? ev.blockNumber : Math.min(earliestFailedBlock, ev.blockNumber);
    } else {
      console.log(`  ✅ [${label}] ${userAddress} → ${side} on ${eventDbId} (${ethers.formatUnits(amount, 18)} USDC)`);
      inserted++;
    }
  }

  console.log(`  [${label}] Done. Inserted: ${inserted}, Skipped: ${skipped}, Failed: ${failed}`);

  // Puro scan + insert pass shesh hole-i checkpoint save koro — moving-target chunk loop
  // ba insert loop-e kono crash hole checkpoint update hobe na, mane next run shei
  // purono checkpoint theke abar shuru korbe (safe — duplicate insert "already exists"
  // check-e skip hoye jabe, kono data miss hobe na).
  //
  // Kintu jodi kono event process korte giye transient error hoy (failed > 0),
  // tahole shei event-er block porjonto checkpoint egiye dewa jabe na — noile
  // পরের রান আর ওই ব্লক scan-ই করবে না, real stake-টা চিরতরে হারিয়ে যাবে।
  if (failed > 0 && earliestFailedBlock !== null) {
    const safeCheckpoint = earliestFailedBlock - 1;
    console.warn(`  ⚠ [${label}] ${failed} event(s) failed — holding checkpoint at ${safeCheckpoint} (instead of ${currentBlock}) so they're retried next run.`);
    await saveCheckpoint(supabase, syncKey, safeCheckpoint);
  } else {
    await saveCheckpoint(supabase, syncKey, currentBlock);
  }
}

async function main() {
  const { APP_SUPABASE_URL, APP_SUPABASE_SERVICE_ROLE_KEY } = process.env;
  if (!APP_SUPABASE_URL || !APP_SUPABASE_SERVICE_ROLE_KEY)
    throw new Error("Missing env: APP_SUPABASE_URL, APP_SUPABASE_SERVICE_ROLE_KEY");
  if (RPC_URLS.length === 0)
    throw new Error("Missing env: ARC_RPC_URL (no RPC endpoint configured at all)");

  const provider = buildProvider();
  const supabase = createClient(APP_SUPABASE_URL, APP_SUPABASE_SERVICE_ROLE_KEY);
  console.log(`RPC endpoints in use: ${RPC_URLS.length} (failover ${RPC_URLS.length > 1 ? "enabled" : "disabled — only one URL configured"})`);

  // Legacy (V1) contract — always scanned, has its own checkpoint. Once every
  // V1 market has finished its lifecycle and stopped receiving new stakes,
  // this naturally settles at "already caught up" every run — harmless
  // no-op, no code change needed to retire it.
  await syncContract({
    label: "legacy",
    syncKey: "sync-stakes-legacy",
    contractAddress: OLD_CONTRACT_ADDRESS,
    deployBlock: DEPLOY_BLOCK,
    provider,
    supabase,
  });

  // V2 contract — only scanned once CONTRACT_ADDRESS actually differs from
  // OLD_CONTRACT_ADDRESS (same guard sync-lifecycle.js uses for its v2
  // group), so this is a safe no-op before the real cutover.
  if (v2CutoverActive) {
    await syncContract({
      label: "v2",
      syncKey: "sync-stakes-v2",
      contractAddress: CONTRACT_ADDRESS,
      deployBlock: DEPLOY_BLOCK_V2,
      provider,
      supabase,
    });
  } else {
    console.log(`\n[v2] Skipped — CONTRACT_ADDRESS still equals OLD_CONTRACT_ADDRESS (cutover not active yet).`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
