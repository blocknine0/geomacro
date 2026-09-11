import { createError, defineEventHandler, readBody, setResponseHeaders } from "h3";
import { z } from "zod";

import { runTestnetBrowserIntelligence } from "../../../src/lib/testnet-browser-intelligence.server";
import { buildTestnetIntelligenceAnswer } from "../../../src/lib/testnet-intelligence-answer.server";
import { loadTestnetTesterAccount } from "../../../src/lib/testnet-tester-account.server";
import { requireTesterPrincipal } from "../../../src/lib/testnet-tester-http.server";

const schema = z.object({
  request_id: z.string().trim().min(8).max(160),
  capability: z.enum([
    "structural_country_digest",
    "structural_corridor_digest",
    "structural_country_profile",
    "structural_corridor_profile",
  ]),
  subject: z.discriminatedUnion("type", [
    z.object({ type: z.literal("country"), country_iso3: z.string().trim().regex(/^[A-Za-z]{3}$/) }),
    z.object({
      type: z.literal("corridor"),
      origin_country_iso3: z.string().trim().regex(/^[A-Za-z]{3}$/),
      destination_country_iso3: z.string().trim().regex(/^[A-Za-z]{3}$/),
    }),
  ]),
});

export default defineEventHandler(async (event) => {
  setResponseHeaders(event, {
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });

  const session = await requireTesterPrincipal(event);
  const account = await loadTestnetTesterAccount(session.principalId);
  if (account.registration_status !== "complete" || account.access_status !== "active") {
    throw createError({ statusCode: 403, statusMessage: "TESTNET_TESTER_ACCESS_NOT_ACTIVE" });
  }

  try {
    const input = schema.parse(await readBody(event));
    const intelligence = await runTestnetBrowserIntelligence({
      principalId: session.principalId,
      requestId: input.request_id,
      capability: input.capability,
      subject: input.subject,
    });
    return {
      ok: true,
      data: {
        ...intelligence,
        answer: buildTestnetIntelligenceAnswer(intelligence.data),
      },
    };
  } catch (error) {
    const code = error instanceof Error ? error.message : "TESTNET_INTELLIGENCE_FAILED";
    const statusCode = code === "STRUCTURAL_DATA_UNAVAILABLE" ? 404 : code === "STRUCTURAL_DATA_NOT_CONFIGURED" ? 503 : 400;
    throw createError({ statusCode, statusMessage: code.slice(0, 120) });
  }
});
