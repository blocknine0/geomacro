import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { assertSameOrigin } from "./origin-guard";
import { readPublicGlobalRisk } from "./global-risk-read.server";
import type { GlobalRisk } from "./global-risk.types";

const EmptyInput = z.object({}).strict();

export type PublicGlobalRiskResult =
  | {
      ok: true;
      data: GlobalRisk;
    }
  | {
      ok: false;
      code: "GRI_UNAVAILABLE";
      message: string;
    };

export const getPublicGlobalRisk = createServerFn({ method: "POST" })
  .validator((input: unknown) => EmptyInput.parse(input))
  .handler(async (): Promise<PublicGlobalRiskResult> => {
    // Keep the security boundary authoritative. Origin failures are not
    // converted into a normal public availability response.
    assertSameOrigin();

    try {
      return {
        ok: true,
        data: await readPublicGlobalRisk(),
      };
    } catch (error) {
      // The GRI reader intentionally fails closed when freshness/proof checks
      // fail. Convert that expected availability state into a typed response so
      // public UI surfaces can render "Unavailable" instead of a runtime error
      // overlay or blank screen. Never return stale/synthetic risk data here.
      console.error("[public-gri] unavailable", error);
      return {
        ok: false,
        code: "GRI_UNAVAILABLE",
        message:
          "The verified Global Risk Index is temporarily unavailable while a fresh proof snapshot is being prepared.",
      };
    }
  });
