// scripts/backfill-tx-hashes.js
// একবার চালানোর জন্য: পুরনো সব market-এর MarketCreated ইভেন্ট অনচেইন থেকে স্ক্যান করে
// market_created_tx_hash কলাম backfill করে দেয় (যেগুলোর tx hash আগে সেভ হয়নি)।
//
// চালানোর নিয়ম (লোকাল টার্মিনালে):
//   DEPLOY_BLOCK=49000000 bun scripts/backfill-tx-hashes.js
// প্রয়োজনীয় env var:
//   ARC_RPC_URL, APP_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, DEPLOY_BLOCK
// DEPLOY_BLOCK বাধ্যতামূলক এখন — না দিলে script fail করবে (0 থেকে scan করলে RPC rate-limit-এ মরে,
// তাই আর "optional, না দিলে ধীরে scan হবে" না — সরাসরি error দেয়)
import { ethers } from "ethers";
import { createClient } from "@supabase/supabase-js";
const RAW_ADDRESS = process.env.CONTRACT_ADDRESS || "0xC026fDFC40Dcd8F07b6ecFA21b2BF8400Db0FADe";
const CONTRACT_ADDRESS = ethers.getAddress(RAW_ADDRESS.toLowerCase());
const DEPLOY_BLOCK = Number(process.env.DEPLOY_BLOCK || 0);

if (!DEPLOY_BLOCK || DEPLOY_BLOCK < 1000) {
  throw new Error(
    `DEPLOY_BLOCK missing or suspiciously low (got: ${process.env.DEPLOY_BLOCK}). ` +
    `Pass it explicitly, e.g. DEPLOY_BLOCK=49000000 bun scripts/backfill-tx-hashes.js — ` +
    `refusing to scan from block 0, that will exhaust RPC rate limits.`
  );
}

const CHUNK_SIZE = 9000; // বেশিরভাগ RPC provider-এর 10,000 block limit এড়াতে
const CONTRACT_ABI = [
  "event MarketCreated(string marketId, uint256 stakingEndTime, uint256 resolutionTime)",
];
async function main() {
  const { ARC_RPC_URL, APP_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
  if (!ARC_RPC_URL || !APP_SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Missing env: ARC_RPC_URL, APP_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY required.");
  }
  const provider = new ethers.JsonRpcProvider(ARC_RPC_URL);
  const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider);
  const adminSupabase = createClient(APP_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const currentBlock = await provider.getBlockNumber();
  console.log(`Current block: ${currentBlock}, scanning from: ${DEPLOY_BLOCK}`);
  const filter = contract.filters.MarketCreated();
  let events = [];
  for (let from = DEPLOY_BLOCK; from <= currentBlock; from += CHUNK_SIZE) {
    const to = Math.min(from + CHUNK_SIZE - 1, currentBlock);
    process.stdout.write(`  Scanning blocks ${from} → ${to}...`);
    const chunk = await contract.queryFilter(filter, from, to);
    events.push(...chunk);
    process.stdout.write(` ${chunk.length} events\n`);
  }
  console.log(`\nTotal: ${events.length} MarketCreated event(s) onchain.`);
  if (events.length === 0) {
    console.log("Nothing to backfill. Done.");
    return;
  }
  let updated = 0, skipped = 0, alreadyHad = 0, failed = 0;
  for (const ev of events) {
    const marketId = ev.args[0]; // যেমন "mkt_99723891-25d2-4b6e-8939-7b944b452040"
    const eventDbId = marketId.replace(/^mkt_/, "");
    const { data: row, error: fetchErr } = await adminSupabase
      .from("events")
      .select("id, market_created_tx_hash")
      .eq("id", eventDbId)
      .maybeSingle();
    if (fetchErr) {
      console.log(`  ❌ ${marketId}: fetch error — ${fetchErr.message}`);
      failed++;
      continue;
    }
    if (!row) {
      console.log(`  Skip: ${marketId} not found in Supabase events table.`);
      skipped++;
      continue;
    }
    if (row.market_created_tx_hash) {
      alreadyHad++;
      continue;
    }
    const { error: updErr } = await adminSupabase
      .from("events")
      .update({ market_created_tx_hash: ev.transactionHash })
      .eq("id", eventDbId);
    if (updErr) {
      console.log(`  ❌ ${marketId}: update error — ${updErr.message}`);
      failed++;
    } else {
      console.log(`  ✅ ${marketId} → ${ev.transactionHash}`);
      updated++;
    }
  }
  console.log(`\nDone. Updated: ${updated}, Already had: ${alreadyHad}, Skipped: ${skipped}, Failed: ${failed}`);
}
main().catch((err) => {
  console.error("Backfill failed:", err);
  process.exit(1);
});
