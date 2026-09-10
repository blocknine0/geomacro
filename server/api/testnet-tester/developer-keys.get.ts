import { defineEventHandler, setResponseHeaders } from "h3";

import { listTestnetDeveloperApiKeys } from "../../../src/lib/testnet-developer-management.server";
import { requireTesterPrincipal } from "../../../src/lib/testnet-tester-http.server";

export default defineEventHandler(async (event) => {
  setResponseHeaders(event, {
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  const session = await requireTesterPrincipal(event);
  const keys = await listTestnetDeveloperApiKeys(session.principalId);
  return { ok: true, data: keys, execution_authorized: false };
});
