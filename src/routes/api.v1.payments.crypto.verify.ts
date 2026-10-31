import { createFileRoute } from "@tanstack/react-router";
const H = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Access-Control-Allow-Methods": "POST, OPTIONS" } as const;

/**
 * Fail-closed mainnet verification boundary. Must not accept a transaction
 * hash as proof of ownership, issue credits, or call paid ledger while locked.
 * Existing no-card RPC readbacks elsewhere remain untouched.
 */
export const Route = createFileRoute("/api/v1/payments/crypto/verify")({
  server: { handlers: {
    OPTIONS: async () => new Response(null, { status: 204, headers: H }),
    POST: async () => Response.json({
      ok: false, code: "EXTERNAL_PAYMENTS_LOCKED",
      chargeable: false, settlement_verified: false, credits_funded: 0,
    }, { status: 423, headers: H }),
  }},
});
