import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { readB2PublicIntelligence } from "./b2-live.server";
import type { PublicEventDetail } from "./public-event.functions";

const EventInput = z.object({
  eventId: z.string().trim().min(1).max(128).regex(/^[a-zA-Z0-9_-]+$/),
});

function fromB2Row(row: NonNullable<Awaited<ReturnType<typeof readB2PublicIntelligence>>>[number]): PublicEventDetail {
  return {
    id: row.id,
    source_title: row.source_title,
    summary: row.summary,
    narrative: null,
    category: row.category,
    severity: row.severity,
    confidence: null,
    delta: row.delta,
    published_at: row.published_at,
    created_at: row.created_at,
  };
}

/**
 * Public, read-only event lookup for route loaders and search/social metadata.
 * Production SEO uses the same verified B2 public intelligence package as the
 * interactive event page, so crawlers cannot reintroduce a database dependency.
 */
export const getPublicEventSeoDetail = createServerFn({ method: "GET" })
  .validator((input: unknown) => EventInput.parse(input))
  .handler(async ({ data }): Promise<PublicEventDetail | null> => {
    const b2Rows = await readB2PublicIntelligence();
    const b2Row = b2Rows?.find((row) => row.id === data.eventId);
    return b2Row ? fromB2Row(b2Row) : null;
  });
