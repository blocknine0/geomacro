import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { assertPublicReadOrigin } from "./origin-guard";
import { readB2PublicIntelligence } from "./b2-live.server";
import type { PublicIntelligenceRow } from "./public-intelligence.functions";

const EmptyInput = z.object({}).strict();

/**
 * Customer-facing production intelligence read.
 *
 * The public website must not fall through to Supabase when B2 is unavailable.
 * Supabase remains available only to explicit ingestion/recovery code paths.
 */
export async function readPublicIntelligenceRowsFromB2(): Promise<PublicIntelligenceRow[]> {
  const rows = await readB2PublicIntelligence();
  return rows ?? [];
}

export const getPublicIntelligenceFromB2 = createServerFn({ method: "POST" })
  .validator((input: unknown) => EmptyInput.parse(input))
  .handler(async (): Promise<PublicIntelligenceRow[]> => {
    assertPublicReadOrigin();
    return readPublicIntelligenceRowsFromB2();
  });
