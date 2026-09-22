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
  published_at: string | null;
  created_at: string;
};

/** Public event details intentionally exclude upstream publisher identity and URLs. */
export const getPublicEventDetail = createServerFn({ method: "POST" })
  .validator((input: unknown) => EventInput.parse(input))
  .handler(async ({ data }): Promise<PublicEventDetail | null> => {
    assertSameOrigin();
    const supabase = getAppSupabase();
    if (!supabase) throw new Error("Intelligence store unavailable");

    const result = await supabase
      .from("events")
      .select(
        "id,source_title,summary,narrative,category,severity,confidence,delta,published_at,created_at",
      )
      .eq("id", data.eventId)
      .maybeSingle();

    if (result.error) {
      console.error("[public-event] canonical read failed", result.error.message);
      throw new Error("Intelligence event unavailable");
    }

    if (result.data) return result.data as PublicEventDetail;

    const structured = await supabase
      .from("live_structured_events")
      .select("id,title,summary,domain,severity,confidence,last_seen_at,first_seen_at,created_at")
      .eq("id", data.eventId)
      .maybeSingle();

    if (structured.error || !structured.data) {
      throw new Error("Intelligence event unavailable");
    }

    return {
      id: String(structured.data.id),
      source_title: structured.data.title ? String(structured.data.title) : null,
      summary: structured.data.summary ? String(structured.data.summary) : null,
      narrative: null,
      category: String(structured.data.domain),
      severity: Number.isFinite(Number(structured.data.severity)) ? Number(structured.data.severity) : null,
      confidence: Number.isFinite(Number(structured.data.confidence)) ? Number(structured.data.confidence) : null,
      delta: null,
      published_at: structured.data.last_seen_at ? String(structured.data.last_seen_at) : null,
      created_at: String(structured.data.created_at ?? structured.data.first_seen_at ?? structured.data.last_seen_at),
    };
  });
