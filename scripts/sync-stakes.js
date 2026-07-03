// scripts/sync-stakes.js
// onchain Staked events পড়ে Supabase positions table-এ missing entries insert করে
import { ethers } from "ethers";
import { createClient } from "@supabase/supabase-js";

const RAW_ADDRESS = process.env.CONTRACT_ADDRESS || "0xC026fDFC40Dcd8F07b6ecFA21b2BF8400Db0FADe";
const CONTRACT_ADDRESS = ethers.getAddress(RAW_ADDRESS.toLowerCase());
const DEPLOY_BLOCK = Number(process.env.DEPLOY_BLOCK || 0); // contract deploy block number

const CONTRACT_ABI = [
  "event Staked(string marketId, address indexed user, uint8 side, uint256 amount)",
];

// Side mapping: 1 = HAWK, 2 = DOVE
const SIDE_MAP = { 1: "HAWK", 2: "DOVE" };

async function main() {
  const { ARC_RPC_URL, APP_SUPABASE_URL, APP_SUPABASE_SERVICE_ROLE_KEY } = process.env;
  if (!ARC_RPC_URL || !APP_SUPABASE_URL || !APP_SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Missing env: ARC_RPC_URL, APP_SUPABASE_URL, APP_SUPABASE_SERVICE_ROLE_KEY");
  }

  const provider = new ethers.JsonRpcProvider(ARC_RPC_URL);
  const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider);

  // Service role key ব্যবহার করছি — RLS bypass করে সব wallets sync করতে পারবে
  const supabase = createClient(APP_SUPABASE_URL, APP_SUPABASE_SERVICE_ROLE_KEY);

  const currentBlock = await provider.getBlockNumber();
  console.log(`Current block: ${currentBlock}`);
  console.log(`Scanning from block: ${DEPLOY_BLOCK}`);

  // Staked events query করো
  const filter = contract.filters.Staked();
  const events = await contract.queryFilter(filter, DEPLOY_BLOCK, currentBlock);
  console.log(`Found ${events.length} Staked event(s) onchain.`);

  let inserted = 0;
  let skipped = 0;

  for (const ev of events) {
    const log = ev;
    const marketId = log.args[0]; // "mkt_uuid"
    const userAddress = log.args[1].toLowerCase();
    const sideCode = Number(log.args[2]);
    const amount = log.args[3]; // wei as bigint

    const side = SIDE_MAP[sideCode];
    if (!side) {
      console.log(`  Unknown side code ${sideCode} for ${marketId}, skipping.`);
      continue;
    }

    // marketId থেকে events.id বের করো — "mkt_uuid" → "uuid"
    const eventDbId = marketId.replace(/^mkt_/, "");

    // events table-এ এই id আছে কিনা check করো
    const { data: eventRow } = await supabase
      .from("events")
      .select("id")
      .eq("id", eventDbId)
      .single();

    if (!eventRow) {
      console.log(`  Event ${eventDbId} not in Supabase, skipping ${marketId}.`);
      skipped++;
      continue;
    }

    // positions table-এ already আছে কিনা check করো
    const { data: existing } = await supabase
      .from("positions")
      .select("market_id")
      .eq("wallet_address", userAddress)
      .eq("market_id", eventDbId)
      .single();

    if (existing) {
      console.log(`  Position already exists for ${userAddress} × ${eventDbId}, skipping.`);
      skipped++;
      continue;
    }

    // Insert missing position
    const { error } = await supabase.from("positions").insert({
      wallet_address: userAddress,
      market_id: eventDbId,
      side,
      staked_amount_raw: amount.toString(),
      status: "active",
    });

    if (error) {
      console.error(`  ❌ Failed to insert position for ${userAddress} × ${eventDbId}: ${error.message}`);
    } else {
      console.log(`  ✅ Inserted: ${userAddress} staked ${side} on ${eventDbId} (${ethers.formatUnits(amount, 18)} USDC)`);
      inserted++;
    }
  }

  console.log(`\nDone. Inserted: ${inserted}, Skipped: ${skipped}`);
}

main().catch(console.error);
