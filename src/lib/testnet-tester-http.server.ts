import { createError, type H3Event } from "h3";

import { requireTestnetTesterSession } from "./testnet-tester-account.server";
import { testerSessionTokenFromRequest } from "./testnet-tester-cookie.server";

export async function requireTesterPrincipal(event: H3Event) {
  const token = testerSessionTokenFromRequest(event);
  if (!token) {
    throw createError({ statusCode: 401, statusMessage: "Tester session required" });
  }

  try {
    return await requireTestnetTesterSession(token);
  } catch {
    throw createError({ statusCode: 401, statusMessage: "Tester session not authorized" });
  }
}
