import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getAppSupabase } from "./supabase-app.server";
import {
  readPublicIntelligenceRows,
  type PublicIntelligenceRow,
} from "./public-intelligence.functions";

const EmptyInput = z.object({}).strict();
const DAY_MS = 24 * 60 * 60 * 1000;

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
