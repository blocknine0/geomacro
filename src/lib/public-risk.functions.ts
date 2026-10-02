import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { assertPublicReadOrigin } from "./origin-guard";
import { readB2PublicRisk } from "./b2-live.server";
import type { GlobalRisk } from "./global-risk.types";

const EmptyInput = z.object({}).strict();

export type PublicGlobalRiskResponse =
  | { ok: true; data: GlobalRisk }
  | {
      ok: false;
      code: "RISK_INDEX_UNAVAILABLE";
      message: string;
      retryable: true;
    };

/**
 * Customer-facing production risk boundary.
 *
 * The website serves only the verified B2 continuity package. Supabase reads
 * and Supabase Edge Functions remain explicit ingestion/recovery paths and are
 * never an automatic public fallback.
 */
export const getPublicGlobalRisk = createServerFn({ method: "POST" })
  .validator((input: unknown) => EmptyInput.parse(input))
  .handler(async (): Promise<PublicGlobalRiskResponse> => {
    assertPublicReadOrigin();

    const data = await readB2PublicRisk();
    if (data) return { ok: true, data };

    console.error("[public-gri] verified B2 public risk snapshot unavailable");
    return {
      ok: false,
      code: "RISK_INDEX_UNAVAILABLE",
      message: "The latest verified risk package is temporarily unavailable. Please retry.",
      retryable: true,
    };
  });
