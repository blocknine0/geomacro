// scripts/sync-stakes.js
// onchain Staked events পড়ে Supabase positions table-এ missing entries insert করে
import { ethers } from "ethers";
import { createClient } from "@supabase/supabase-js";

const RAW_ADDRESS = process.env.CONTRACT_ADDRESS || "0xC026fDFC40Dcd8F07b6ecFA21b2BF8400Db0FADe";
const CONTRACT_ADDRESS = ethers.getAddress(RAW_ADDRESS.toLowerCase());
const DEPLOY_BLOCK = Number(process.env.DEPLOY_BLOCK || 0);
const CHUNK_SIZE = 9000;

const CONTRACT_ABI = [
  "event Staked(string marketId, address indexed user, uint8 side, uint256 amount)",
];

const SIDE_MAP = { 1: "HAWK", 2: "DOVE" };

async function main() {
  const { ARC_RPC_URL, APP_SUPABASE_URL, APP_SUPABASE_SERVICE_ROLE_KEY } = process.env;
  if (!ARC_RPC_URL || !APP_SUPABASE_URL || !APP_SUPABASE_SERVICE_ROLE_KEY)
    throw new Error("Missing env: ARC_RPC_URL, APP_SUPABASE_URL, APP_SUPABASE_SERVICE_ROLE_KEY");

  const provider = new ethers.JsonRpcProvider(ARC_RPC_URL);
  const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider);
  const supabase = createClient(APP_SUPABASE_URL, APP_SUPABASE_SERVICE_ROLE_KEY);

  const currentBlock = await provider.getBlockNumber();
  console.log(`Current block: ${currentBlock}, scanning from: ${DEPLOY_BLOCK}`);

  // 10,000 block limit এড়াতে chunked scanning
  const filter = contract.filters.Staked();
  let events = [];
  for (let from = DEPLOY_BLOCK; from <= currentBlock; from += CHUNK_SIZE) {
    const to = Math.min(from + CHUNK_SIZE - 1, currentBlock);
    process.stdout.write(`  Scanning blocks ${from} → ${to}...`);
    const chunk = await contract.queryFilter(filter, from, to);
    events.push(...chunk);
    process.stdout.write(` ${chunk.length} events\n`);
  }
  console.log(`\nTotal: ${events.length} Staked event(s) onchain.`);

  if (events.length === 0) {
    console.log("No stakes found. Done.");
    return;
  }

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
}

main().catch(console.error);
