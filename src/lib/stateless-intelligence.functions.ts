import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const Input = z.object({
  category: z.enum(["geopolitics", "macro", "rare_earth"]),
}).strict();

/**
 * A read-only, request-scoped Geomacro website source signal snapshot.
 * No material is persisted to a DB, B2, cache, filesystem or log.
 * The 15-minute cutoff is enforced BEFORE any signal leaves this server function.
 */
export const getStatelessIntelligence = createServerFn({ method: "GET" })
  .validator((input: unknown) => Input.parse(input))
  .handler(async ({ data }) => {
    const { setResponseHeaders } = await import("@tanstack/react-start/server");
    setResponseHeaders(new Headers({
      "Cache-Control": "no-store, max-age=0",
      "CDN-Cache-Control": "no-store",
      Pragma: "no-cache",
      "X-Robots-Tag": "noarchive",
    }));
    const { readStatelessWebsiteIntelligence } =
      await import("./stateless-public-intelligence.server");
    return readStatelessWebsiteIntelligence(data.category);
  });
