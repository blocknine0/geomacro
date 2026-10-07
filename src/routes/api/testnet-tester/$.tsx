import { createFileRoute } from "@tanstack/react-router";

const notFound = () =>
  Response.json(
    { ok: false, error: "NOT_FOUND", execution_authorized: false },
    { status: 404, headers: { "Cache-Control": "no-store" } },
  );

export const Route = createFileRoute("/api/testnet-tester/$")({
  server: {
    handlers: {
      GET: notFound,
      POST: notFound,
      PUT: notFound,
      PATCH: notFound,
      DELETE: notFound,
    },
  },
});
