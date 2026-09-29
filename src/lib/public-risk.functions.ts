import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { assertSameOrigin } from "./origin-guard";
import { readB2PublicRisk } from "./b2-live.server";
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
    assertSameOrigin();

    const b2 = await readB2PublicRisk();
    if (b2) return { ok: true, data: b2 };

    try {
      return { ok: true, data: await readPublicGlobalRisk() };
    } catch (directError) {
      const detail = directError instanceof Error ? directError.message : "unknown error";
      console.warn("[public-gri] B2 and hosted canonical reads unavailable; trying authoritative edge", detail);
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
