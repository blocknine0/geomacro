// scripts/sync-stakes.js
// onchain Staked events পড়ে Supabase positions table-এ missing entries insert করে
import { ethers } from "ethers";
import { createClient } from "@supabase/supabase-js";

const RAW_ADDRESS = process.env.CONTRACT_ADDRESS || "0xC026fDFC40Dcd8F07b6ecFA21b2BF8400Db0FADe";
const CONTRACT_ADDRESS = ethers.getAddress(RAW_ADDRESS.toLowerCase());
const DEPLOY_BLOCK = Number(process.env.DEPLOY_BLOCK || 0);

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

const SYNC_KEY = "sync-stakes"; // sync_state table-e ei row-e checkpoint thake
const REORG_SAFETY_BLOCKS = 50; // last checkpoint theke ektu piche giye re-scan koro, testnet reorg-safety
const CHUNK_SIZE = 9000;
const CHUNK_DELAY_MS = 400; // consecutive chunk-er majhe chhoto pause, burst rate-limit avoid korte

const CONTRACT_ABI = [
  "event Staked(string marketId, address indexed user, uint8 side, uint256 amount)",
];
const SIDE_MAP = { 1: "HAWK", 2: "DOVE" };

// src/lib/arc.ts-er ARC_TESTNET_RPC_URLS + FallbackProvider pattern-er sathe consistent —
// ekta RPC rate-limit/down hole onnota-y transparently failover kore.
const RPC_URLS = [process.env.ARC_RPC_URL, "https://rpc.testnet.arc.network", "https://arc-testnet.drpc.org"]
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

async function getStartBlock(supabase) {
  const { data, error } = await supabase
    .from("sync_state")
    .select("last_synced_block")
    .eq("key", SYNC_KEY)
    .maybeSingle();

  if (error) {
    // sync_state table na thakle (migration run kora hoy nai) — DEPLOY_BLOCK diye fallback,
    // kintu warn koro jate clear thake table create korte hobe.
    console.warn(`  ⚠ Could not read sync_state (${error.message}). Falling back to DEPLOY_BLOCK. ` +
      `Run the sync_state_migration.sql if you haven't yet.`);
    return DEPLOY_BLOCK;
  }

  if (!data) {
    console.log(`  No checkpoint found yet — first run, starting from DEPLOY_BLOCK (${DEPLOY_BLOCK})`);
    return DEPLOY_BLOCK;
  }

  const resumeFrom = Math.max(DEPLOY_BLOCK, data.last_synced_block - REORG_SAFETY_BLOCKS);
  console.log(`  Resuming from checkpoint: block ${data.last_synced_block} (rescanning last ${REORG_SAFETY_BLOCKS} blocks for safety → starting at ${resumeFrom})`);
  return resumeFrom;
}

async function saveCheckpoint(supabase, block) {
  const { error } = await supabase
    .from("sync_state")
    .upsert({ key: SYNC_KEY, last_synced_block: block, updated_at: new Date().toISOString() });
  if (error) {
    console.warn(`  ⚠ Could not save checkpoint (${error.message}). Next run will re-scan from the old checkpoint — safe, just slower.`);
  } else {
    console.log(`  ✓ Checkpoint saved: ${block}`);
  }
}

async function main() {
  const { APP_SUPABASE_URL, APP_SUPABASE_SERVICE_ROLE_KEY } = process.env;
  if (!APP_SUPABASE_URL || !APP_SUPABASE_SERVICE_ROLE_KEY)
    throw new Error("Missing env: APP_SUPABASE_URL, APP_SUPABASE_SERVICE_ROLE_KEY");
  if (RPC_URLS.length === 0)
    throw new Error("Missing env: ARC_RPC_URL (no RPC endpoint configured at all)");

  const provider = buildProvider();
  const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider);
  const supabase = createClient(APP_SUPABASE_URL, APP_SUPABASE_SERVICE_ROLE_KEY);

  const currentBlock = await withRpcRetry(() => provider.getBlockNumber());
  const startBlock = await getStartBlock(supabase);
  console.log(`Current block: ${currentBlock}, scanning from: ${startBlock}`);
  console.log(`RPC endpoints in use: ${RPC_URLS.length} (failover ${RPC_URLS.length > 1 ? "enabled" : "disabled — only one URL configured"})`);

  if (startBlock > currentBlock) {
    console.log("Already caught up. Done.");
    return;
  }

  // 10,000 block limit এড়াতে chunked scanning, প্রতিটি chunk retry-protected
  const filter = contract.filters.Staked();
  let events = [];
  for (let from = startBlock; from <= currentBlock; from += CHUNK_SIZE) {
    const to = Math.min(from + CHUNK_SIZE - 1, currentBlock);
    process.stdout.write(`  Scanning blocks ${from} → ${to}...`);
    const chunk = await withRpcRetry(() => contract.queryFilter(filter, from, to));
    events.push(...chunk);
    process.stdout.write(` ${chunk.length} events\n`);
    await sleep(CHUNK_DELAY_MS);
  }
  console.log(`\nTotal: ${events.length} Staked event(s) found in this range.`);

  let inserted = 0, skipped = 0, failed = 0;

  for (const ev of events) {
    const marketId = ev.args[0];
    const userAddress = ev.args[1].toLowerCase();
    const sideCode = Number(ev.args[2]);
    const amount = ev.args[3];
    const side = SIDE_MAP[sideCode];

    if (!side) {
      console.log(`  Skip: unknown side code ${sideCode} for ${marketId}`);
      skipped++;
      continue;
    }

    // "mkt_uuid" → "uuid"
    const eventDbId = marketId.replace(/^mkt_/, "");

    // events table-এ আছে কিনা check
    const { data: eventRow } = await supabase
      .from("events")
      .select("id")
      .eq("id", eventDbId)
      .maybeSingle();

    if (!eventRow) {
      console.log(`  Skip: event ${eventDbId} not in Supabase`);
      skipped++;
      continue;
    }

    // already আছে কিনা check
    const { data: existing } = await supabase
      .from("positions")
      .select("market_id")
      .eq("wallet_address", userAddress)
      .eq("market_id", eventDbId)
      .maybeSingle();

    if (existing) {
      console.log(`  Skip: ${userAddress} × ${eventDbId} already exists`);
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
      console.error(`  ❌ ${userAddress} × ${eventDbId}: ${error.message}`);
      failed++;
    } else {
      console.log(`  ✅ ${userAddress} → ${side} on ${eventDbId} (${ethers.formatUnits(amount, 18)} USDC)`);
      inserted++;
    }
  }

  console.log(`\nDone. Inserted: ${inserted}, Skipped: ${skipped}, Failed: ${failed}`);

  // Puro scan + insert pass shesh hole-i checkpoint save koro — moving-target chunk loop
  // ba insert loop-e kono crash hole checkpoint update hobe na, mane next run shei
  // purono checkpoint theke abar shuru korbe (safe — duplicate insert "already exists"
  // check-e skip hoye jabe, kono data miss hobe na).
  await saveCheckpoint(supabase, currentBlock);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
