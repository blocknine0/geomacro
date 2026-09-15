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

    return (result.data as PublicEventDetail | null) ?? null;
  });
