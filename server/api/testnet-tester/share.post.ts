import { createError, defineEventHandler, readBody, setResponseHeaders } from "h3";

import { createTestnetSharePage } from "../../../src/lib/testnet-share.server";
import { requireTesterPrincipal } from "../../../src/lib/testnet-tester-http.server";

export default defineEventHandler(async (event) => {
  setResponseHeaders(event, { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
  const session = await requireTesterPrincipal(event);
  const body = await readBody<Record<string, unknown>>(event);

  try {
    const result = await createTestnetSharePage({
      principalId: session.principalId,
      usageEventId: String(body?.usage_event_id ?? ""),
      displayProfileName: body?.display_profile_name === true,
      card: {
        subject: String(body?.subject ?? "Geomacro Risk Intelligence"),
        summary: String(body?.summary ?? "Explainable geopolitical and macro risk intelligence for testing."),
        score: body?.score == null ? null : Number(body.score),
        delta: body?.delta == null ? null : Number(body.delta),
        confidence: body?.confidence == null ? null : Number(body.confidence),
        chain: String(body?.chain ?? "Multichain Testnet"),
      },
    });

    const site = String(process.env.PUBLIC_SITE_URL ?? "https://geomacro.live").replace(/\/$/, "");
    return {
      ok: true,
      data: {
        ...result,
        share_url: `${site}/share/testnet/${result.share_slug}`,
        card_url: `${site}/api/testnet-tester/share-card/${result.share_slug}`,
      },
    };
  } catch (error) {
    const code = error instanceof Error ? error.message : "TESTNET_SHARE_CREATE_FAILED";
    throw createError({ statusCode: 400, statusMessage: code.slice(0, 120) });
  }
});
