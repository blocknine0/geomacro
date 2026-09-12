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
              alignment_contract:
                "github-main-external-supabase-lovable-v1",
              source_authority:
                "github-main",
              database_authority:
                "external-supabase",
              supabase_project_ref:
                "ldpwajisioljyjtojvfx",
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
