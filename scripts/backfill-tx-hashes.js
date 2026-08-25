// scripts/backfill-tx-hashes.js
// Backfills MarketCreated transaction hashes across BOTH V1 and V2.
//
// V1 remains permanently readable for historical markets.
// V2 is the current contract for new markets.

import { ethers } from "ethers";
import { createClient } from "@supabase/supabase-js";

const OLD_CONTRACT_ADDRESS = ethers.getAddress(
  (process.env.OLD_CONTRACT_ADDRESS || "0xC026fDFC40Dcd8F07b6ecFA21b2BF8400Db0FADe").toLowerCase()
);

const CURRENT_CONTRACT_ADDRESS = ethers.getAddress(
  (process.env.CONTRACT_ADDRESS || "0x2F874FB07084a22D2bB314D0762Af57Cb1856868").toLowerCase()
);

const DEPLOY_BLOCK = Number(process.env.DEPLOY_BLOCK || 0);

if (!DEPLOY_BLOCK || DEPLOY_BLOCK < 1000) {
  throw new Error(
    `DEPLOY_BLOCK missing or suspiciously low (got: ${process.env.DEPLOY_BLOCK}). ` +
    `Pass it explicitly; refusing to scan from block 0.`
  );
}

const CHUNK_SIZE = 9000;

const CONTRACT_ABI = [
  "event MarketCreated(string marketId, uint256 stakingEndTime, uint256 resolutionTime)",
];

async function scanContract(contract, fromBlock, toBlock, label) {
  const filter = contract.filters.MarketCreated();
  const events = [];

  for (let from = fromBlock; from <= toBlock; from += CHUNK_SIZE) {
    const to = Math.min(from + CHUNK_SIZE - 1, toBlock);

    process.stdout.write(
      `  [${label}] scanning blocks ${from} → ${to}...`
    );

    const chunk = await contract.queryFilter(filter, from, to);

    events.push(
      ...chunk.map((event) => ({
        event,
        label,
        contractAddress: contract.target,
      }))
    );

    process.stdout.write(` ${chunk.length} events\n`);
  }

  return events;
}

async function main() {
  const {
    ARC_RPC_URL,
    APP_SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY,
  } = process.env;

  if (!ARC_RPC_URL || !APP_SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      "Missing env: ARC_RPC_URL, APP_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY required."
    );
  }

  const provider = new ethers.JsonRpcProvider(ARC_RPC_URL);
  const adminSupabase = createClient(
    APP_SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY
  );

  const currentBlock = await provider.getBlockNumber();

  const v1Contract = new ethers.Contract(
    OLD_CONTRACT_ADDRESS,
    CONTRACT_ABI,
    provider
  );

  const v2Contract = new ethers.Contract(
    CURRENT_CONTRACT_ADDRESS,
    CONTRACT_ABI,
    provider
  );

  console.log(
    `Scanning V1 + V2 from block ${DEPLOY_BLOCK} to ${currentBlock}`
  );

  const [v1Events, v2Events] = await Promise.all([
    scanContract(v1Contract, DEPLOY_BLOCK, currentBlock, "V1"),
    scanContract(v2Contract, DEPLOY_BLOCK, currentBlock, "V2"),
  ]);

  const allEvents = [...v1Events, ...v2Events];

  console.log(
    `\nTotal MarketCreated events: ${allEvents.length} ` +
    `(V1=${v1Events.length}, V2=${v2Events.length})`
  );

  let updated = 0;
  let skipped = 0;
  let alreadyHad = 0;
  let failed = 0;

  for (const item of allEvents) {
    const ev = item.event;
    const marketId = ev.args[0];
    const eventDbId = marketId.replace(/^mkt_/, "");

    const { data: row, error: fetchErr } = await adminSupabase
      .from("events")
      .select("id, market_created_tx_hash, market_address")
      .eq("id", eventDbId)
      .maybeSingle();

    if (fetchErr) {
      console.log(
        `  ❌ [${item.label}] ${marketId} fetch error — ${fetchErr.message}`
      );
      failed++;
      continue;
    }

    if (!row) {
      console.log(
        `  Skip [${item.label}]: ${marketId} not found in events table`
      );
      skipped++;
      continue;
    }

    if (row.market_created_tx_hash) {
      alreadyHad++;
      continue;
    }

    const update = {
      market_created_tx_hash: ev.transactionHash,
    };

    // Preserve existing market_address if already populated.
    // Otherwise backfill it from the contract that emitted MarketCreated.
    if (!row.market_address) {
      update.market_address = item.contractAddress;
    }

    const { error: updErr } = await adminSupabase
      .from("events")
      .update(update)
      .eq("id", eventDbId);

    if (updErr) {
      console.log(
        `  ❌ [${item.label}] ${marketId} update error — ${updErr.message}`
      );
      failed++;
    } else {
      console.log(
        `  ✅ [${item.label}] ${marketId} → ${ev.transactionHash}`
      );
      updated++;
    }
  }

  console.log(
    `\nDone. Updated=${updated}, Already had=${alreadyHad}, ` +
    `Skipped=${skipped}, Failed=${failed}`
  );
}

main().catch((err) => {
  console.error("Backfill failed:", err);
  process.exit(1);
});
