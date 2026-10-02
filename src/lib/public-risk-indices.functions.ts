import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { assertSameOrigin } from "./origin-guard";
import { readB2PublicRisk } from "./b2-live.server";
import { riskIndicesFromGlobalRisk } from "./risk-indices-from-global-risk";
import type { PublicRiskIndices } from "./risk-indices.types";

const EmptyInput = z.object({}).strict();

export type PublicRiskIndicesResponse =
  | { ok: true; data: PublicRiskIndices }
  | {
      ok: false;
      code: "RISK_INDICES_UNAVAILABLE";
      message: string;
      retryable: true;
    };

/**
 * Customer-facing production boundary.
 *
 * Risk Indices are served from the verified B2 continuity package. This path
 * intentionally does not contact the Supabase Edge Function: Supabase is a
 * recovery/ingestion system, not a customer-facing production dependency.
 */
export const getPublicRiskIndices = createServerFn({ method: "POST" })
  .validator((input: unknown) => EmptyInput.parse(input))
  .handler(async (): Promise<PublicRiskIndicesResponse> => {
    assertSameOrigin();

    const risk = await readB2PublicRisk();
    if (risk) {
      return { ok: true, data: riskIndicesFromGlobalRisk(risk) };
    }

    console.error("[public-risk-indices] verified B2 public risk snapshot unavailable");
    return {
      ok: false,
      code: "RISK_INDICES_UNAVAILABLE",
      message: "The latest verified risk package is temporarily unavailable. Please retry.",
      retryable: true,
    };
  });
