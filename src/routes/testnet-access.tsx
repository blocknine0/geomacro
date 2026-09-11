import { createFileRoute } from "@tanstack/react-router";
import { mockEvent } from "h3";
import testnetAccessHandler from "../../server/routes/testnet-access.get";

// Compatibility wrapper: reuses the existing h3 tester page handler so the
// deployed TanStack app serves the same content and headers at /testnet-access.
export const Route = createFileRoute("/testnet-access")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const event = mockEvent(request);
        const result = await testnetAccessHandler(event);
        return new Response(typeof result === "string" ? result : JSON.stringify(result), {
          status: event.res.status ?? 200,
          statusText: event.res.statusText,
          headers: event.res.headers,
        });
      },
    },
  },
});