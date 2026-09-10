import { defineEventHandler, setResponseHeaders } from "h3";

import { clearTesterSessionCookie } from "../../../src/lib/testnet-tester-cookie.server";
import { requireTesterPrincipal } from "../../../src/lib/testnet-tester-http.server";
import { revokeTestnetTesterSession } from "../../../src/lib/testnet-tester-session-management.server";

export default defineEventHandler(async (event) => {
  setResponseHeaders(event, {
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });

  const session = await requireTesterPrincipal(event);
  await revokeTestnetTesterSession({
    principalId: session.principalId,
    sessionId: session.sessionId,
  });
  clearTesterSessionCookie(event);
  return { ok: true, data: { logged_out: true }, execution_authorized: false };
});
