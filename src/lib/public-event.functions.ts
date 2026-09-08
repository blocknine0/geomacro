import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { assertSameOrigin } from "./origin-guard";
import { getAppSupabase } from "./supabase-app.server";

const EventInput = z.object({
  eventId: z.string().trim().min(1).max(128).regex(/^[a-zA-Z0-9_-]+$/),
});

export type PublicEventDetail = {
  id: string;
  source_title: string | null;
  summary: string | null;
  narrative: string | null;
  category: string | null;
  severity: number | null;
  confidence: number | null;
  delta: number | null;
  source_name: string | null;
  source_domain: string | null;
  source_url: string | null;
  published_at: string | null;
  created_at: string;
};

export const getPublicEventDetail = createServerFn({ method: "POST" })
  .validator((input: unknown) => EventInput.parse(input))
  .handler(async ({ data }): Promise<PublicEventDetail | null> => {
    assertSameOrigin();
    const supabase = getAppSupabase();
    if (!supabase) throw new Error("Intelligence store unavailable");

    const result = await supabase
      .from("events")
      .select(
        "id,source_title,summary,narrative,category,severity,confidence,delta,source_name,source_domain,source_url,published_at,created_at",
      )
      .eq("id", data.eventId)
      .maybeSingle();

    if (result.error) {
      console.error("[public-event] canonical read failed", result.error.message);
      throw new Error("Intelligence event unavailable");
    }

    return (result.data as PublicEventDetail | null) ?? null;
  });
