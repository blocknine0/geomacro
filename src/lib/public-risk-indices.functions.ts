import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { assertSameOrigin } from "./origin-guard";
import { readPublicRiskIndicesFromEdge } from "./public-risk-edge.server";
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

export const getPublicRiskIndices = createServerFn({ method: "POST" })
  .validator((input: unknown) => EmptyInput.parse(input))
  .handler(async (): Promise<PublicRiskIndicesResponse> => {
    assertSameOrigin();

    try {
      return { ok: true, data: await readPublicRiskIndicesFromEdge() };
    } catch (error) {
      console.error(
        "[public-risk-indices] authoritative edge read unavailable",
        error instanceof Error ? error.message : "unknown error",
      );
      return {
        ok: false,
        code: "RISK_INDICES_UNAVAILABLE",
        message: "The verified risk indices are temporarily unavailable. Please retry.",
        retryable: true,
      };
    }
  });
