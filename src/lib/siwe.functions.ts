// src/lib/siwe.functions.ts
import {
  createHash,
  randomBytes,
  randomUUID,
} from "node:crypto";
import { createServerFn } from "@tanstack/react-start";
import { assertSameOrigin } from "./origin-guard";
import { z } from "zod";
import { verifyMessage } from "ethers";
import { SignJWT } from "jose";
import { requireRiskSupabase } from "./risk-supabase.server";

const SIWE_DOMAIN = "geomacro.live";
const MAX_MESSAGE_AGE_MS = 5 * 60 * 1000;
const NONCE_BYTES = 32;

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/** Client and server both build this exact string, so the signature can be re-verified. */
export function buildSiweMessage(
  address: string,
  nonce: string,
  issuedAt: number,
): string {
  return `${SIWE_DOMAIN} wants you to sign in with your Ethereum account:\n${address}\n\nSign in to Geomacro Portfolio.\n\nNonce: ${nonce}\nIssued At: ${issuedAt}`;
}

const AddressInput = z.object({
  address: z.string().regex(/^0x[a-fA-F0-9]{40}$/, "Invalid address"),
});

const VerifyInput = z.object({
  address: z.string().regex(/^0x[a-fA-F0-9]{40}$/, "Invalid address"),
  nonce: z.string().regex(/^[a-f0-9]{64}$/, "Invalid sign-in nonce"),
  issuedAt: z.number().int().positive(),
  signature: z.string().min(1),
});

/**
 * Issues a short-lived, one-time SIWE challenge.
 *
 * Only SHA-256(nonce) is persisted. The plaintext nonce is returned once to
 * the same-origin client and is bound into the wallet-signed message.
 */
export const issueSiweChallenge = createServerFn({ method: "POST" })
  .validator((input: unknown) => AddressInput.parse(input))
  .handler(async ({ data }) => {
    assertSameOrigin();

    const walletAddress = data.address.toLowerCase();
    const nonce = randomBytes(NONCE_BYTES).toString("hex");
    const nonceHash = sha256(nonce);
    const issuedAt = Date.now();
    const expiresAt = new Date(issuedAt + MAX_MESSAGE_AGE_MS).toISOString();
    const db = requireRiskSupabase();

    // Best-effort bounded-retention cleanup. Failure here must not weaken the
    // challenge insert/verification path, so it is intentionally non-fatal.
    void db
      .from("siwe_login_nonces")
      .delete()
      .lte("expires_at", new Date().toISOString())
      .then(({ error }) => {
        if (error) {
          console.warn("[siwe] expired nonce cleanup failed", error.message);
        }
      });

    const { error } = await db
      .from("siwe_login_nonces")
      .insert({
        nonce_hash: nonceHash,
        wallet_address: walletAddress,
        issued_at_ms: issuedAt,
        expires_at: expiresAt,
      });

    if (error) {
      console.error("[siwe] challenge persistence failed", error.message);
      throw new Error("Sign-in service unavailable");
    }

    return {
      nonce,
      issuedAt,
      expiresAt,
    };
  });

/**
 * Verifies a personal_sign signature proves ownership of `address`, atomically
 * consumes the server-issued nonce, then mints a short-lived
 * Supabase-compatible JWT carrying a custom `wallet_address` claim.
 *
 * The same signed challenge cannot mint a second token: the database consume
 * operation is one-time and atomic. Freshness remains a secondary bound, not
 * the replay-protection mechanism.
 */
export const verifySiwe = createServerFn({ method: "POST" })
  .validator((input: unknown) => VerifyInput.parse(input))
  .handler(async ({ data }) => {
    assertSameOrigin();
    const { address, nonce, issuedAt, signature } = data;

    const age = Date.now() - issuedAt;
    if (age < 0 || age > MAX_MESSAGE_AGE_MS) {
      throw new Error("Sign-in message expired — please try again");
    }

    const message = buildSiweMessage(address, nonce, issuedAt);
    let recovered: string;
    try {
      recovered = verifyMessage(message, signature);
    } catch {
      throw new Error("Invalid signature");
    }
    if (recovered.toLowerCase() !== address.toLowerCase()) {
      throw new Error("Signature does not match wallet address");
    }

    const walletAddress = address.toLowerCase();
    const nonceHash = sha256(nonce);
    const db = requireRiskSupabase();
    const { data: consumed, error: consumeError } = await db.rpc(
      "consume_siwe_login_nonce",
      {
        p_nonce_hash: nonceHash,
        p_wallet_address: walletAddress,
        p_issued_at_ms: issuedAt,
      },
    );

    if (consumeError) {
      console.error("[siwe] nonce consume failed", consumeError.message);
      throw new Error("Sign-in service unavailable");
    }
    if (consumed !== true) {
      throw new Error("Sign-in challenge expired or already used — please try again");
    }

    const secret = process.env.APP_SUPABASE_JWT_SECRET;
    if (!secret) throw new Error("Auth service unavailable");

    const token = await new SignJWT({
      role: "authenticated",
      wallet_address: walletAddress,
    })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setSubject(walletAddress)
      .setIssuer(SIWE_DOMAIN)
      .setAudience("authenticated")
      .setJti(randomUUID())
      .setIssuedAt()
      .setExpirationTime("24h")
      .sign(new TextEncoder().encode(secret));

    return { token, walletAddress };
  });
