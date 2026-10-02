import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { readB2PublicIntelligence } from "./b2-live.server";
import { assertPublicReadOrigin } from "./origin-guard";

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

/** Public event details intentionally exclude upstream publisher identity and URLs. */
export const getPublicEventDetail = createServerFn({ method: "POST" })
  .validator((input: unknown) => EventInput.parse(input))
  .handler(async ({ data }): Promise<PublicEventDetail | null> => {
    assertPublicReadOrigin();

    const b2Rows = await readB2PublicIntelligence();
    const b2Row = b2Rows?.find((row) => row.id === data.eventId);
    return b2Row ? fromB2Row(b2Row) : null;
  });
