import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const Input = z.object({
  category: z.enum(["geopolitics", "macro", "rare_earth"]),
}).strict();

/**
 * A read-only, request-scoped Geomacro website source signal snapshot.
 * No material is persisted to a DB, B2, cache, filesystem or log.
 * The 60-minute cutoff is enforced BEFORE any signal leaves this server function.
 */
export const getStatelessIntelligence = createServerFn({ method: "GET" })
  .validator((input: unknown) => Input.parse(input))
  .handler(async ({ data }) => {
    const { readStatelessWebsiteIntelligence } =
      await import("./stateless-public-intelligence.server");
    return readStatelessWebsiteIntelligence(data.category);
  });
