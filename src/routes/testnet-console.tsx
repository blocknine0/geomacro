import { createFileRoute } from "@tanstack/react-router";
import { mockEvent } from "h3";
import testnetConsoleHandler from "../../server/routes/testnet-console.get";

// Compatibility wrapper: reuses the existing h3 tester console handler so the
// deployed TanStack app serves the same content and headers at /testnet-console.
export const Route = createFileRoute("/testnet-console")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const event = mockEvent(request);
        const result = await testnetConsoleHandler(event);
        return new Response(typeof result === "string" ? result : JSON.stringify(result), {
          status: event.res.status ?? 200,
          statusText: event.res.statusText,
          headers: event.res.headers,
        });
      },
    },
  },
});