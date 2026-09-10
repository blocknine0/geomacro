import { createError, defineEventHandler, readBody, setResponseHeaders } from "h3";

import { activateTestnetTesterPayment } from "../../../src/lib/testnet-tester-payment.server";
import { requireTesterPrincipal } from "../../../src/lib/testnet-tester-http.server";

export default defineEventHandler(async (event) => {
  setResponseHeaders(event, { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
  const session = await requireTesterPrincipal(event);
  const body = await readBody<Record<string, unknown>>(event);

  const result = await activateTestnetTesterPayment({
    principal_id: session.principalId,
    chain_key: String(body?.chain_key ?? ""),
    tx_hash: String(body?.tx_hash ?? ""),
    payer_address: String(body?.payer_address ?? ""),
  });

  if (!result.ok) {
    throw createError({ statusCode: 400, statusMessage: result.code.slice(0, 120) });
  }

  return { ok: true, data: result, execution_authorized: false };
});
