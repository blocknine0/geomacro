import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { assertSameOrigin } from "./origin-guard";
import { getAppSupabase } from "./supabase-app.server";

const EmptyInput = z.object({}).strict();
const DAY_MS = 24 * 60 * 60 * 1000;

export type PublicIntelligenceRow = {
  id: string;
  source_title: string | null;
  summary: string | null;
  category: string | null;
  severity: number | null;
  delta: number | null;
  source_name: string | null;
  created_at: string;
  published_at: string | null;
};

/**
 * Canonical public Intelligence read path.
 *
 * The browser no longer talks directly to Supabase for this product surface.
 * That keeps production independent of stale VITE_* values in the hosting
 * layer and guarantees Intelligence, Ask Geomacro and the GRI all read from
 * the same app-owned Supabase project.
 */
export const getPublicIntelligence = createServerFn({ method: "POST" })
  .validator((input: unknown) => EmptyInput.parse(input))
  .handler(async (): Promise<PublicIntelligenceRow[]> => {
    assertSameOrigin();
    const supabase = getAppSupabase();
    if (!supabase) throw new Error("Intelligence store unavailable");

    const since = new Date(Date.now() - 30 * DAY_MS).toISOString();
    const { data, error } = await supabase
      .from("events")
      .select(
        "id,source_title,summary,category,severity,delta,source_name,created_at,published_at",
      )
      .in("category", ["geopolitics", "macro", "rare_earth"])
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(500);

    if (error) {
      console.error("[public-intelligence] canonical read failed", error.message);
      throw new Error("Intelligence feed unavailable");
    }

    return (data ?? []) as PublicIntelligenceRow[];
  });
