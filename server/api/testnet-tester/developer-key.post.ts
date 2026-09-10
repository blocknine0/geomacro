import { createError, defineEventHandler, readBody, setResponseHeaders } from "h3";

import { issueTestnetDeveloperApiKey, type TestnetIntegrationType } from "../../../src/lib/testnet-developer-access.server";
import { requireTesterPrincipal } from "../../../src/lib/testnet-tester-http.server";

const TYPES = new Set<TestnetIntegrationType>(["product_api", "ai_agent", "automation", "demo"]);

export default defineEventHandler(async (event) => {
  setResponseHeaders(event, { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
  const session = await requireTesterPrincipal(event);
  const body = await readBody<Record<string, unknown>>(event);
  const rawType = String(body?.integration_type ?? "product_api") as TestnetIntegrationType;
  if (!TYPES.has(rawType)) throw createError({ statusCode: 400, statusMessage: "INVALID_INTEGRATION_TYPE" });

  try {
    const result = await issueTestnetDeveloperApiKey({
      principalId: session.principalId,
      label: String(body?.label ?? "Default test integration"),
      integrationType: rawType,
    });
    return { ok: true, data: result, warning: "Store this API key now. It will not be shown again." };
  } catch (error) {
    const code = error instanceof Error ? error.message : "TESTNET_DEVELOPER_KEY_FAILED";
    throw createError({ statusCode: 400, statusMessage: code.slice(0, 120) });
  }
});
