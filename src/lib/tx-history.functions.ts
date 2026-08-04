// src/lib/tx-history.functions.ts
//
// Bridge/Swap history, Supabase-backed. Deliberately frictionless — unlike
// Portfolio (which requires a SIWE session), this only needs a connected
// wallet. To prevent someone writing fake history entries under another
// wallet's address, recordTxHistory verifies on-chain that the given tx
// hash was actually sent from the claimed address before inserting.
// Reads are just filtered by wallet address — this data isn't meaningfully
// private (it's a wallet's own on-chain activity, visible on Arcscan
// regardless), so no session is required to read it either.
import { createServerFn } from "@tanstack/react-start";
import { assertSameOrigin } from "./origin-guard";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import { JsonRpcProvider } from "ethers";

const ARC_TESTNET_RPC_URLS = [
  process.env.ARC_TESTNET_RPC_URL,
  "https://rpc.testnet.arc.network",
  "https://arc-testnet.drpc.org",
].filter((u): u is string => typeof u === "string" && u.length > 0);

async function verifyTxOwnership(params: { txHash: string; expectedFrom: string }): Promise<void> {
  const { txHash, expectedFrom } = params;
  if (!/^0x[0-9a-fA-F]{64}$/.test(txHash)) throw new Error("Invalid transaction hash");

  let lastErr: unknown = null;
  for (const url of ARC_TESTNET_RPC_URLS) {
    try {
      const provider = new JsonRpcProvider(url);
      const [tx, receipt] = await Promise.all([
        provider.getTransaction(txHash),
        provider.getTransactionReceipt(txHash),
      ]);
      if (!tx || !receipt) throw new Error("Transaction not found on-chain");
      if (receipt.status !== 1) throw new Error("Transaction reverted on-chain");
      if (tx.from.toLowerCase() !== expectedFrom.toLowerCase()) {
        throw new Error("Transaction sender does not match the given wallet address");
      }
      return;
    } catch (err) {
      lastErr = err;
      const msg = (err as Error)?.message ?? "";
      const transient = msg.includes("Transaction not found") || msg.includes("network") || msg.includes("timeout") || msg.includes("fetch");
      if (!transient) throw err;
    }
  }
  throw new Error(`Could not verify transaction on Arc RPC: ${(lastErr as Error)?.message ?? "unknown error"}`);
}

function getServiceClient() {
  const url = process.env.APP_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error("Service unavailable");
  return createClient(url, serviceKey);
}

const RecordTxHistoryInput = z.object({
  walletAddress: z.string().regex(/^0x[0-9a-fA-F]{40}$/, "Invalid wallet address"),
  type: z.enum(["bridge", "swap"]),
  txHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/, "Invalid tx hash"),
  tokenIn: z.string().min(1),
  tokenOut: z.string().min(1),
  amountIn: z.string().min(1),
  amountOut: z.string().optional(),
  feeTxHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/).optional(),
  feeUsdc: z.string().optional(),
  explorerUrl: z.string().url(),
});

export const recordTxHistory = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => RecordTxHistoryInput.parse(input))
  .handler(async ({ data }) => {
    assertSameOrigin();

    await verifyTxOwnership({ txHash: data.txHash, expectedFrom: data.walletAddress });

    const supabase = getServiceClient();
    const { error } = await supabase.from("tx_history").upsert(
      {
        wallet_address: data.walletAddress.toLowerCase(),
        type: data.type,
        tx_hash: data.txHash,
        token_in: data.tokenIn,
        token_out: data.tokenOut,
        amount_in: data.amountIn,
        amount_out: data.amountOut ?? null,
        fee_tx_hash: data.feeTxHash ?? null,
        fee_usdc: data.feeUsdc ?? null,
        explorer_url: data.explorerUrl,
      },
      { onConflict: "wallet_address,tx_hash" }, // idempotent — a retried call doesn't duplicate
    );
    if (error) throw new Error(`Could not record history: ${error.message}`);

    return { ok: true };
  });

export type TxHistoryRow = {
  type: "bridge" | "swap";
  tx_hash: string;
  token_in: string;
  token_out: string;
  amount_in: string;
  amount_out: string | null;
  fee_tx_hash: string | null;
  fee_usdc: string | null;
  explorer_url: string;
  created_at: string;
};

const GetTxHistoryInput = z.object({
  walletAddress: z.string().regex(/^0x[0-9a-fA-F]{40}$/, "Invalid wallet address"),
});

export const getMyTxHistory = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => GetTxHistoryInput.parse(input))
  .handler(async ({ data }) => {
    assertSameOrigin();

    const supabase = getServiceClient();
    const { data: rows, error } = await supabase
      .from("tx_history")
      .select("type, tx_hash, token_in, token_out, amount_in, amount_out, fee_tx_hash, fee_usdc, explorer_url, created_at")
      .eq("wallet_address", data.walletAddress.toLowerCase())
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) throw new Error(`Could not load history: ${error.message}`);
    return (rows ?? []) as TxHistoryRow[];
  });
