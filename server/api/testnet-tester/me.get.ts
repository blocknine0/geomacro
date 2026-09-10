import { defineEventHandler, setResponseHeaders } from "h3";

import { loadTestnetTesterAccount } from "../../../src/lib/testnet-tester-account.server";
import { requireTesterPrincipal } from "../../../src/lib/testnet-tester-http.server";

export default defineEventHandler(async (event) => {
  setResponseHeaders(event, { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
  const session = await requireTesterPrincipal(event);
  const account = await loadTestnetTesterAccount(session.principalId);
  return { ok: true, data: account };
});
