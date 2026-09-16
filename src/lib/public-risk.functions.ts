import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { assertSameOrigin } from "./origin-guard";
import { readPublicGlobalRisk } from "./global-risk-read.server";
import { readPublicGlobalRiskFromEdge } from "./public-risk-edge.server";
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

export const getPublicGlobalRisk = createServerFn({ method: "POST" })
  .validator((input: unknown) => EmptyInput.parse(input))
  .handler(async (): Promise<PublicGlobalRiskResponse> => {
    // Keep the security boundary outside availability handling. A cross-origin
    // request is a policy violation and must still fail hard.
    assertSameOrigin();

    try {
      return { ok: true, data: await readPublicGlobalRisk() };
    } catch (directError) {
      const detail = directError instanceof Error ? directError.message : "unknown error";
      console.warn("[public-gri] hosted canonical read unavailable; trying authoritative edge", detail);
    }

    try {
      return { ok: true, data: await readPublicGlobalRiskFromEdge() };
    } catch (edgeError) {
      const detail = edgeError instanceof Error ? edgeError.message : "unknown error";
      console.error("[public-gri] authoritative edge fallback unavailable", detail);
      return {
        ok: false,
        code: "RISK_INDEX_UNAVAILABLE",
        message: "The verified risk indices are temporarily unavailable. Please retry.",
        retryable: true,
      };
    }
  });
