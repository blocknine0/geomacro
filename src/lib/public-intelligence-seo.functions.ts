import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { readPublicIntelligenceRows } from "./public-intelligence.functions";
import type { PublicIntelligenceRow } from "./public-intelligence.functions";

const EmptyInput = z.object({}).strict();
/**
 * Public, read-only intelligence lookup for SSR/search discovery.
 * Returns only the same public fields used by the /intelligence workspace.
 */
export const getPublicIntelligenceSeo = createServerFn({ method: "GET" })
  .validator((input: unknown) => EmptyInput.parse(input))
  .handler(async (): Promise<PublicIntelligenceRow[]> => {
    try {
      return await readPublicIntelligenceRows();
    } catch (error) {
      console.error(
        "[public-intelligence-seo] canonical read failed",
        error instanceof Error ? error.message : String(error),
      );
      return [];
    }
  });
