import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/testnet-console")({
  server: {
    handlers: {
      GET: async ({ request }) => Response.redirect(new URL("/data-api", request.url), 308),
    },
  },
});
