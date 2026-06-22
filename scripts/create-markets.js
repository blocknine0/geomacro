// scripts/create-markets.js
//
// Automation script for Geomacro Agent Arena.
// Runs on a schedule via GitHub Actions (see .github/workflows/auto-create-markets.yml).
//
// What it does:
// 1. Reads all relevant events from Supabase that don't have a market yet.
// 2. For each event, calls createMarket() on the AgentArena contract.
// 3. Stores market_threshold and resolution_at in Supabase so both the
//    frontend countdown and resolve-markets.js use the exact same values.
//    This is the single source of truth for resolution timing.
// 4. Keeps market_created = true so the same event never gets a duplicate market.
//
// Required environment variables (set as GitHub Secrets):
//   OWNER_PRIVATE_KEY      - the wallet that deployed AgentArena (owner)
//   APP_SUPABASE_URL       - Supabase project URL
//   APP_SUPABASE_ANON_KEY  - Supabase anon key
//   ARC_RPC_URL            - Arc Testnet RPC endpoint

import { ethers } from "ethers";
import { createClient } from "@supabase/supabase-js";

const CONTRACT_ADDRESS = "0xa1dA6c1AC816B7b9D740ca284AC342D0b704Ce6D";
const SEVERITY_THRESHOLD = 0; // all relevant events get a market, severity is not a gate
const MAX_NEW_MARKETS_PER_RUN = 10; // safety cap so one run can't spam many markets
const THRESHOLD_STEP = 5; // market question is "escalate past severity (event.severity + THRESHOLD_STEP)"
const RESOLUTION_HOURS = 48; // markets resolve 48 hours after creation

const CONTRACT_ABI = [
  "function createMarket(string marketId) external",
  "function markets(string) view returns (string marketId, uint8 status, uint8 winner, uint256 hawkTotal, uint256 doveTotal, bool exists)",
];

async function main() {
  const {
    OWNER_PRIVATE_KEY,
    APP_SUPABASE_URL,
    APP_SUPABASE_ANON_KEY,
    ARC_RPC_URL,
  } = process.env;

  if (!OWNER_PRIVATE_KEY || !APP_SUPABASE_URL || !APP_SUPABASE_ANON_KEY || !ARC_RPC_URL) {
    throw new Error(
      "Missing required environment variables. Need OWNER_PRIVATE_KEY, APP_SUPABASE_URL, APP_SUPABASE_ANON_KEY, ARC_RPC_URL."
    );
  }

  const supabase = createClient(APP_SUPABASE_URL, APP_SUPABASE_ANON_KEY);
  const provider = new ethers.JsonRpcProvider(ARC_RPC_URL);
  const wallet = new ethers.Wallet(OWNER_PRIVATE_KEY, provider);
  const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, wallet);

  console.log(`Using wallet: ${wallet.address}`);
  const balance = await provider.getBalance(wallet.address);
  console.log(`Wallet balance: ${ethers.formatUnits(balance, 18)} USDC`);

  // Fetch all relevant events that don't have a market yet.
  const { data: events, error } = await supabase
    .from("events")
    .select("id, source_title, category, severity, created_at, market_created")
    .or("market_created.is.null,market_created.eq.false")
    .order("created_at", { ascending: false })
    .limit(MAX_NEW_MARKETS_PER_RUN);

  if (error) {
    throw new Error(`Supabase query failed: ${error.message}`);
  }

  if (!events || events.length === 0) {
    console.log("No new events without a market. Nothing to do.");
    return;
  }

  console.log(`Found ${events.length} candidate event(s) for new markets.`);

  for (const event of events) {
    const marketId = `mkt_${event.id}`;
    const marketThreshold = event.severity + THRESHOLD_STEP;

    // resolution_at is the single source of truth for when this market resolves.
    // Both the frontend countdown and resolve-markets.js read this same value.
    const resolutionAt = new Date(
      new Date(event.created_at).getTime() + RESOLUTION_HOURS * 60 * 60 * 1000
    ).toISOString();

    try {
      // Check on-chain if this market already exists (belt-and-suspenders,
      // in case the Supabase marker got out of sync).
      const existing = await contract.markets(marketId);
      if (existing.exists) {
        console.log(`Market ${marketId} already exists on-chain. Marking as created and skipping.`);
        await supabase
          .from("events")
          .update({
            market_created: true,
            market_threshold: marketThreshold,
            resolution_at: resolutionAt,
          })
          .eq("id", event.id);
        continue;
      }

      console.log(
        `Creating market ${marketId} for "${event.source_title}" (severity ${event.severity}, threshold ${marketThreshold}, resolves at ${resolutionAt})...`
      );
      const tx = await contract.createMarket(marketId);
      console.log(`  tx sent: ${tx.hash}`);
      const receipt = await tx.wait();
      console.log(`  confirmed in block ${receipt.blockNumber}`);

      // Store market_threshold and resolution_at so frontend and backend
      // both use the exact same values — no independent recalculation.
      const { error: updateError } = await supabase
        .from("events")
        .update({
          market_created: true,
          market_threshold: marketThreshold,
          resolution_at: resolutionAt,
        })
        .eq("id", event.id);

      if (updateError) {
        console.warn(`  Warning: failed to update event ${event.id}: ${updateError.message}`);
      }
    } catch (err) {
      console.error(`Failed to create market for event ${event.id}: ${err.message}`);
      // Continue with the next event rather than failing the whole run.
    }
  }

  console.log("Done.");
}

main().catch((err) => {
  console.error("Fatal error in create-markets script:", err);
  process.exit(1);
});
