import { createFileRoute } from "@tanstack/react-router";
import { readOnlyDualRailCatalog, readOnlyCryptoQuotePreview } from "../lib/dual-rail-checkout-policy";

const H = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Access-Control-Allow-Methods": "GET, POST, OPTIONS" } as const;

/** Public discovery; POST returns a 423 non-payable preview, never a transfer quote. */
export const Route = createFileRoute("/api/v1/payments/crypto/quote")({
  server: { handlers: {
    OPTIONS: async () => new Response(null, { status: 204, headers: H }),
    GET: async () => Response.json(readOnlyDualRailCatalog(), { headers: H }),
    POST: async ({ request }: { request: Request }) => {
      if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json"))
        return Response.json({ ok: false, code: "JSON_REQUIRED" }, { status: 415, headers: H });
      const body = await request.text();
      if (body.length > 4096)
        return Response.json({ ok: false, code: "REQUEST_TOO_LARGE" }, { status: 413, headers: H });
      try {
        const preview = readOnlyCryptoQuotePreview(JSON.parse(body));
        return Response.json(preview, { status: 423, headers: H });
      } catch {
        return Response.json({ ok: false, code: "INVALID_SKU_OR_NETWORK", chargeable: false }, { status: 400, headers: H });
      }
    },
  }},
});
