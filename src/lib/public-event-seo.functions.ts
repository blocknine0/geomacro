import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getAppSupabase } from "./supabase-app.server";
import type { PublicEventDetail } from "./public-event.functions";

const EventInput = z.object({
  eventId: z.string().trim().min(1).max(128).regex(/^[a-zA-Z0-9_-]+$/),
});

/**
 * Public, read-only event lookup for route loaders and search/social metadata.
 *
 * This intentionally returns only the same public fields exposed on the event
 * page. It does not expose publisher identity, upstream URLs or private audit
 * data. Strict ID validation keeps the route lookup bounded while allowing
 * first-request SSR/crawlers that do not send an Origin header.
 */
export const getPublicEventSeoDetail = createServerFn({ method: "GET" })
  .validator((input: unknown) => EventInput.parse(input))
  .handler(async ({ data }): Promise<PublicEventDetail | null> => {
    const supabase = getAppSupabase();
    if (!supabase) return null;

    const result = await supabase
      .from("events")
      .select(
        "id,source_title,summary,narrative,category,severity,confidence,delta,published_at,created_at",
      )
      .eq("id", data.eventId)
      .maybeSingle();

    if (result.error) {
      console.error("[public-event-seo] canonical read failed", result.error.message);
      return null;
    }

    if (result.data) return result.data as PublicEventDetail;

    const structured = await supabase
      .from("live_structured_events")
      .select("id,title,summary,domain,severity,confidence,last_seen_at,first_seen_at,created_at")
      .eq("id", data.eventId)
      .maybeSingle();

    if (structured.error || !structured.data) {
      return null;
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
