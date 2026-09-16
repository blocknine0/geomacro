import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { assertSameOrigin } from "./origin-guard";
import { readPublicGlobalRisk } from "./global-risk-read.server";
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
    // Keep the security boundary outside the availability catch. A cross-origin
    // request is a policy violation and must still fail hard.
    assertSameOrigin();

    try {
      return { ok: true, data: await readPublicGlobalRisk() };
    } catch (error) {
      const detail = error instanceof Error ? error.message : "unknown error";
      console.error("[public-gri] canonical read unavailable", detail);
      return {
        ok: false,
        code: "RISK_INDEX_UNAVAILABLE",
        message: "The verified Global Risk Index is temporarily unavailable. Please retry.",
        retryable: true,
      };
    }
  });
