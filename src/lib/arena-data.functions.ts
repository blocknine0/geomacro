import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { assertSameOrigin } from "./origin-guard";
import { getAppSupabase } from "./supabase-app.server";
import type { StoredEventRow } from "./supabase-feed";

const EmptyInput = z.object({}).strict();

export type ArenaDataSnapshot = {
  rows: StoredEventRow[];
  trackRecord: {
    decided: number;
    HAWK: number | null;
    DOVE: number | null;
  };
};

/**
 * Canonical server-owned read for the Prediction Market technical-proof UI.
 * Browser code must not need a Supabase anon key to discover market metadata
 * or finalized Hawk/Dove track records. Contract reads/writes remain on-chain.
 */
export const getArenaDataSnapshot = createServerFn({ method: "POST" })
  .validator((input: unknown) => EmptyInput.parse(input))
  .handler(async (): Promise<ArenaDataSnapshot> => {
    assertSameOrigin();
    const supabase = getAppSupabase();
    if (!supabase) throw new Error("Arena data store unavailable");

    const [marketRows, hawkCount, doveCount] = await Promise.all([
      supabase
        .from("events")
        .select("*")
        .eq("market_created", true)
        .order("created_at", { ascending: false }),
      supabase
        .from("events")
        .select("id", { count: "exact", head: true })
        .eq("market_created", true)
        .eq("market_resolved", true)
        .eq("ai_tentative_winner", "HAWK"),
      supabase
        .from("events")
        .select("id", { count: "exact", head: true })
        .eq("market_created", true)
        .eq("market_resolved", true)
        .eq("ai_tentative_winner", "DOVE"),
    ]);

    if (marketRows.error) {
      console.error("[arena-data] market rows failed", marketRows.error.message);
      throw new Error("Arena market metadata unavailable");
    }

    if (hawkCount.error || doveCount.error) {
      console.error(
        "[arena-data] track record failed",
        hawkCount.error?.message ?? doveCount.error?.message,
      );
    }

    const hawk = hawkCount.error ? 0 : hawkCount.count ?? 0;
    const dove = doveCount.error ? 0 : doveCount.count ?? 0;
    const decided = hawk + dove;

    return {
      rows: (marketRows.data ?? []) as StoredEventRow[],
      trackRecord:
        decided === 0
          ? { decided: 0, HAWK: null, DOVE: null }
          : {
              decided,
              HAWK: Math.round((hawk / decided) * 100),
              DOVE: Math.round((dove / decided) * 100),
            },
    };
  });
