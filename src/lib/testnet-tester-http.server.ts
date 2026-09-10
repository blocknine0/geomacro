import { createError, getHeader, type H3Event } from "h3";

import { requireTestnetTesterSession } from "./testnet-tester-account.server";

export async function requireTesterPrincipal(event: H3Event) {
  const raw = String(getHeader(event, "authorization") ?? "").trim();
  const match = raw.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    throw createError({ statusCode: 401, statusMessage: "Tester session required" });
  }
  try {
    return await requireTestnetTesterSession(match[1]);
  } catch {
    throw createError({ statusCode: 401, statusMessage: "Tester session not authorized" });
  }
}
