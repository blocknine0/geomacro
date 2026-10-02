import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { readPublicIntelligenceRowsFromB2 } from "./public-intelligence-b2.functions";
import type { PublicIntelligenceRow } from "./public-intelligence.functions";

const EmptyInput = z.object({}).strict();

/**
 * Public, read-only intelligence lookup for SSR/search discovery.
 * Production SSR reads only the verified B2 continuity snapshot.
 */
export const getPublicIntelligenceSeo = createServerFn({ method: "GET" })
  .validator((input: unknown) => EmptyInput.parse(input))
  .handler(async (): Promise<PublicIntelligenceRow[]> => {
    try {
      return await readPublicIntelligenceRowsFromB2();
    } catch (error) {
      console.error(
        "[public-intelligence-seo] verified B2 read failed",
        error instanceof Error ? error.message : String(error),
      );
      return [];
    }
  });
