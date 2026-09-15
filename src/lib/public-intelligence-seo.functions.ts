import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getAppSupabase } from "./supabase-app.server";
import type { PublicIntelligenceRow } from "./public-intelligence.functions";

const EmptyInput = z.object({}).strict();
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Public, read-only intelligence lookup for SSR/search discovery.
 * Returns only the same public fields used by the /intelligence workspace.
 */
export const getPublicIntelligenceSeo = createServerFn({ method: "GET" })
  .validator((input: unknown) => EmptyInput.parse(input))
  .handler(async (): Promise<PublicIntelligenceRow[]> => {
    const supabase = getAppSupabase();
    if (!supabase) return [];

    const since = new Date(Date.now() - 30 * DAY_MS).toISOString();
    const { data, error } = await supabase
      .from("events")
      .select("id,source_title,summary,category,severity,delta,created_at,published_at")
      .in("category", ["geopolitics", "macro", "rare_earth"])
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(500);

    if (error) {
      console.error("[public-intelligence-seo] canonical read failed", error.message);
      return [];
    }

    return (data ?? []) as PublicIntelligenceRow[];
  });
