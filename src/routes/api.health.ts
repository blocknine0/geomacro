import {
  createFileRoute,
} from "@tanstack/react-router";

export const Route =
  createFileRoute(
    "/api/health",
  )({
    server: {
      handlers: {
        GET: async () =>
          Response.json(
            {
              ok: true,
              service:
                "geomacro",
            },
            {
              status: 200,
              headers: {
                "Cache-Control":
                  "no-store",
                "X-Content-Type-Options":
                  "nosniff",
              },
            },
          ),
      },
    },
  });
