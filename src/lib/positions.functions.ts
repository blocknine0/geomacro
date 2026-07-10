// src/lib/positions.functions.ts
import { createServerFn } from "@tanstack/react-start";
import { assertSameOrigin } from "./origin-guard";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import { jwtVerify } from "jose";
import { ethers } from "ethers";

// Server-side verification: never trust a client-submitted stake amount.
// We re-derive the real amount from the on-chain Staked event emitted by
// the confirmed transaction, so a tampered stakedAmountRaw in the request
// body can never create a fake/inflated position.
const STAKE_VERIFY_ABI = [
  "event Staked(string marketId, address indexed user, uint8 side, uint256 amount)",
];
const SIDE_CODE_ONCHAIN: Record<"HAWK" | "DOVE", number> = { HAWK: 1, DOVE: 2 };

async function verifyStakeOnChain(params: {
  txHash: string;
  expectedMarketId: string; // "mkt_<uuid>"
  expectedWallet: string;
  expectedSide: "HAWK" | "DOVE";
}): Promise<{ ok: true; amountRaw: string } | { ok: false; reason: string }> {
  const { ARC_RPC_URL, CONTRACT_ADDRESS } = process.env;
  if (!ARC_RPC_URL || !CONTRACT_ADDRESS) {
    return { ok: false, reason: "Server misconfigured: missing ARC_RPC_URL/CONTRACT_ADDRESS" };
  }
  const provider = new ethers.JsonRpcProvider(ARC_RPC_URL);
  const iface = new ethers.Interface(STAKE_VERIFY_ABI);
  const contractAddress = ethers.getAddress(CONTRACT_ADDRESS.toLowerCase());

  let receipt;
  try {
    receipt = await provider.getTransactionReceipt(params.txHash);
  } catch (err) {
    return { ok: false, reason: `Could not fetch transaction receipt: ${(err as Error).message}` };
  }
  if (!receipt) return { ok: false, reason: "Transaction not found or not yet mined" };
  if (receipt.status !== 1) return { ok: false, reason: "Transaction reverted on-chain" };
  if (receipt.to?.toLowerCase() !== contractAddress.toLowerCase()) {
    return { ok: false, reason: "Transaction was not sent to the AgentArena contract" };
  }
  if (receipt.from.toLowerCase() !== params.expectedWallet.toLowerCase()) {
    return { ok: false, reason: "Transaction sender does not match the authenticated wallet" };
  }

  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== contractAddress.toLowerCase()) continue;
    let parsed;
    try {
      parsed = iface.parseLog({ topics: log.topics as string[], data: log.data });
    } catch {
      continue;
    }
    if (!parsed || parsed.name !== "Staked") continue;

    const evMarketId = String(parsed.args[0]);
    const evUser = String(parsed.args[1]).toLowerCase();
    const evSideCode = Number(parsed.args[2]);
    const evAmount = parsed.args[3] as bigint;

    if (
      evMarketId === params.expectedMarketId &&
      evUser === params.expectedWallet.toLowerCase() &&
      evSideCode === SIDE_CODE_ONCHAIN[params.expectedSide]
    ) {
      return { ok: true, amountRaw: evAmount.toString() };
    }
  }

  return { ok: false, reason: "No matching Staked event found in this transaction's logs" };
}

const RecordStakeInput = z.object({
  token: z.string().min(1),
  marketId: z.string().uuid(),
  side: z.enum(["HAWK", "DOVE"]),
  stakedAmountRaw: z.string().min(1),
  txHash: z.string().min(1),
});

export const recordStake = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => RecordStakeInput.parse(input))
  .handler(async ({ data }) => {
    assertSameOrigin();

    const jwtSecret = process.env.APP_SUPABASE_JWT_SECRET;
    const url = process.env.APP_SUPABASE_URL;
    const anonKey = process.env.APP_SUPABASE_ANON_KEY;
    if (!jwtSecret || !url || !anonKey) throw new Error("Service unavailable");

    let walletAddress: string;
    try {
      const { payload } = await jwtVerify(data.token, new TextEncoder().encode(jwtSecret));
      walletAddress = String(payload.wallet_address ?? "");
    } catch {
      throw new Error("Session expired — please sign in again");
    }
    if (!walletAddress) throw new Error("Invalid session");

    // ⚠️ SECURITY FIX: stakedAmountRaw is client-submitted and must never be
    // trusted directly — it only reflects what the user typed into the
    // input box, not what was actually staked on-chain. We verify the
    // confirmed transaction and derive the real amount from its Staked
    // event log before writing anything to positions.
    const verification = await verifyStakeOnChain({
      txHash: data.txHash,
      expectedMarketId: `mkt_${data.marketId}`,
      expectedWallet: walletAddress,
      expectedSide: data.side,
    });
    if (!verification.ok) {
      throw new Error(`Could not verify stake on-chain: ${verification.reason}`);
    }
    const verifiedAmountRaw = verification.amountRaw;

    const supabase = createClient(url, anonKey, {
      global: { headers: { Authorization: `Bearer ${data.token}` } },
    });

    const { error: posErr } = await supabase.from("positions").upsert(
      {
        wallet_address: walletAddress,
        market_id: data.marketId,
        side: data.side,
        staked_amount_raw: verifiedAmountRaw,
        status: "active",
      },
      { onConflict: "wallet_address,market_id" },
    );
    if (posErr) throw new Error(`Could not record position: ${posErr.message}`);

    const stakedDisplay = Number(verifiedAmountRaw) / 1e18;
    const { error: histErr } = await supabase.from("wallet_balance_history").insert({
      wallet_address: walletAddress,
      balance: 0,
      event_type: "stake",
      market_id: data.marketId,
      amount_delta: -stakedDisplay,
    });
    if (histErr) console.error("[recordStake] balance history insert failed", histErr.message);

    return { ok: true };
  });

const RecordClaimInput = z.object({
  token: z.string().min(1),
  marketId: z.string().uuid(),
  txHash: z.string().min(1),
});

export const recordClaim = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => RecordClaimInput.parse(input))
  .handler(async ({ data }) => {
    assertSameOrigin();

    const jwtSecret = process.env.APP_SUPABASE_JWT_SECRET;
    const url = process.env.APP_SUPABASE_URL;
    const anonKey = process.env.APP_SUPABASE_ANON_KEY;
    if (!jwtSecret || !url || !anonKey) throw new Error("Service unavailable");

    let walletAddress: string;
    try {
      const { payload } = await jwtVerify(data.token, new TextEncoder().encode(jwtSecret));
      walletAddress = String(payload.wallet_address ?? "");
    } catch {
      throw new Error("Session expired — please sign in again");
    }
    if (!walletAddress) throw new Error("Invalid session");

    const supabase = createClient(url, anonKey, {
      global: { headers: { Authorization: `Bearer ${data.token}` } },
    });

    const { data: existing, error: fetchErr } = await supabase
      .from("positions")
      .select("payout_amount")
      .eq("wallet_address", walletAddress)
      .eq("market_id", data.marketId)
      .eq("status", "pending_claim")
      .single();

    if (fetchErr || !existing) throw new Error("No pending claim found for this market");

    const { error: updErr } = await supabase
      .from("positions")
      .update({ status: "claimed", claimed_at: new Date().toISOString() })
      .eq("wallet_address", walletAddress)
      .eq("market_id", data.marketId)
      .eq("status", "pending_claim");

    if (updErr) throw new Error(`Could not record claim: ${updErr.message}`);

    await supabase.from("wallet_balance_history").insert({
      wallet_address: walletAddress,
      balance: existing.payout_amount ?? 0,
      event_type: "claim",
      market_id: data.marketId,
      amount_delta: existing.payout_amount ?? 0,
    });

    return { ok: true };
  });

const TokenOnly = z.object({ token: z.string().min(1) });

// url আর anonKey return করা হচ্ছে — events anon fetch-এর জন্য
async function verifyTokenAndClient(token: string) {
  const jwtSecret = process.env.APP_SUPABASE_JWT_SECRET;
  const url = process.env.APP_SUPABASE_URL;
  const anonKey = process.env.APP_SUPABASE_ANON_KEY;
  if (!jwtSecret || !url || !anonKey) throw new Error("Service unavailable");
  let walletAddress: string;
  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(jwtSecret));
    walletAddress = String(payload.wallet_address ?? "");
  } catch {
    throw new Error("Session expired — please sign in again");
  }
  if (!walletAddress) throw new Error("Invalid session");
  const supabase = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  return { supabase, walletAddress, url, anonKey };
}

export type PortfolioPosition = {
  market_id: string;
  side: "HAWK" | "DOVE";
  staked_amount_raw: string;
  status: "active" | "pending_claim" | "claimed" | "lost";
  payout_amount: number | null;
  resolved_outcome: "HAWK" | "DOVE" | null;
  claimed_at: string | null;
  created_at: string;
  event: {
    id: string;
    source_title: string | null;
    narrative: string | null;
    category: string | null;
    source_url: string | null;
    resolution_at: string | null;
  } | null;
};

export const getMyPositions = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => TokenOnly.parse(i))
  .handler(async ({ data }) => {
    assertSameOrigin();
    const { supabase, walletAddress, url, anonKey } = await verifyTokenAndClient(data.token);

    const { data: rows, error } = await supabase
      .from("positions")
      .select(
        "market_id, side, staked_amount_raw, status, payout_amount, resolved_outcome, claimed_at, created_at",
      )
      .eq("wallet_address", walletAddress)
      .order("created_at", { ascending: false });

    if (error) throw new Error(`Could not load positions: ${error.message}`);

    const positions = (rows ?? []) as Omit<PortfolioPosition, "event">[];
    const ids = Array.from(new Set(positions.map((p) => p.market_id).filter(Boolean)));

    let eventsById: Record<string, PortfolioPosition["event"]> = {};
    if (ids.length > 0) {
      // anon client ব্যবহার করছি — events_anon_read policy anon role-এর জন্য,
      // authenticated JWT দিয়ে সেই policy match করে না
      const anonSupabase = createClient(url, anonKey);
      const { data: evs } = await anonSupabase
        .from("events")
        .select("id, source_title, narrative, category, source_url, resolution_at")
        .in("id", ids);
      for (const e of evs ?? []) {
        eventsById[e.id as string] = e as PortfolioPosition["event"];
      }
    }

    const withEvents: PortfolioPosition[] = positions.map((p) => ({
      ...p,
      event: eventsById[p.market_id] ?? null,
    }));

    return { walletAddress, positions: withEvents };
  });

export type BalanceHistoryRow = {
  id: string;
  wallet_address: string;
  balance: number;
  event_type: string;
  market_id: string | null;
  amount_delta: number;
  created_at: string;
};

export const getMyBalanceHistory = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => TokenOnly.parse(i))
  .handler(async ({ data }) => {
    assertSameOrigin();
    const { supabase, walletAddress } = await verifyTokenAndClient(data.token);
    const { data: rows, error } = await supabase
      .from("wallet_balance_history")
      .select("id, wallet_address, balance, event_type, market_id, amount_delta, created_at")
      .eq("wallet_address", walletAddress)
      .order("created_at", { ascending: true });
    if (error) throw new Error(`Could not load history: ${error.message}`);
    return (rows ?? []) as BalanceHistoryRow[];
  });
