// src/lib/siwe.functions.ts
import { createServerFn } from "@tanstack/react-start";
import { assertSameOrigin } from "./origin-guard";
import { z } from "zod";
import { verifyMessage } from "ethers";
import { SignJWT } from "jose";

const SIWE_DOMAIN = "geomacro.live";
const MAX_MESSAGE_AGE_MS = 5 * 60 * 1000; // 5 min window — replay protection, no server-side nonce storage needed

/** Client and server both build this exact string, so the signature can be re-verified. */
export function buildSiweMessage(address: string, issuedAt: number): string {
  return `${SIWE_DOMAIN} wants you to sign in with your Ethereum account:\n${address}\n\nSign in to Geomacro Portfolio.\n\nIssued At: ${issuedAt}`;
}

const VerifyInput = z.object({
  address: z.string().regex(/^0x[a-fA-F0-9]{40}$/, "Invalid address"),
  issuedAt: z.number(),
  signature: z.string().min(1),
});

/**
 * Verifies a personal_sign signature proves ownership of `address`, then mints
 * a short-lived Supabase-compatible JWT carrying a custom `wallet_address` claim.
 * That JWT is what RLS policies on `positions` / `wallet_balance_history` check
 * against — never the raw wallet address sent unauthenticated from the client.
 *
 * Requires APP_SUPABASE_JWT_SECRET env var (Supabase dashboard → Settings →
 * API → JWT Settings → JWT Secret). Named with the APP_ prefix (not
 * SUPABASE_) because Lovable's Secrets UI reserves the SUPABASE_ prefix for
 * its own auto-managed keys and will reject anything else starting with it.
 * Add via Lovable → Cloud tab → Secrets. Never expose client-side.
 */
export const verifySiwe = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => VerifyInput.parse(input))
  .handler(async ({ data }) => {
    assertSameOrigin();
    const { address, issuedAt, signature } = data;

    const age = Date.now() - issuedAt;
    if (age < 0 || age > MAX_MESSAGE_AGE_MS) {
      throw new Error("Sign-in message expired — please try again");
    }

    const message = buildSiweMessage(address, issuedAt);
    let recovered: string;
    try {
      recovered = verifyMessage(message, signature);
    } catch {
      throw new Error("Invalid signature");
    }
    if (recovered.toLowerCase() !== address.toLowerCase()) {
      throw new Error("Signature does not match wallet address");
    }

    const secret = process.env.APP_SUPABASE_JWT_SECRET;
    if (!secret) throw new Error("Auth service unavailable");

    const walletAddress = address.toLowerCase();
    const token = await new SignJWT({
      role: "authenticated",
      wallet_address: walletAddress,
    })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(walletAddress)
      .setIssuedAt()
      .setExpirationTime("24h")
      .sign(new TextEncoder().encode(secret));

    return { token, walletAddress };
  });
