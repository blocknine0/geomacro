import { createFileRoute } from "@tanstack/react-router";
import { earnFirstStructuralOfferHandlers } from "../lib/earn-first-structural-offers.server";
import { checkStructuredProductSetup } from "../lib/structured-product-setup.server";
import { structuredProductSetup } from "../lib/structured-product-setup";

function setupView(request: Request) {
  const q = new URL(request.url).searchParams;
  if (!q.has("view")) return "legacy";
  return q.getAll("view").length === 1 &&
    q.get("view") === "setup" &&
    [...q.keys()].every((k) => k === "view")
    ? "setup"
    : "invalid";
}
function invalid() {
  return Response.json(
    { ok: false, chargeable: false, error: "SETUP_QUERY_INVALID" },
    { status: 400, headers: { "Cache-Control": "no-store" } },
  );
}
/** Legacy baseline preflight remains available; setup is explicitly opt-in. */
export const Route = createFileRoute("/api/v1/intelligence/availability")({
  server: {
    handlers: {
      ...earnFirstStructuralOfferHandlers,
      GET: async ({ request }: { request: Request }) => {
        const view = setupView(request);
        if (view === "invalid") return invalid();
        if (view === "legacy") return earnFirstStructuralOfferHandlers.GET();
        return Response.json(structuredProductSetup(), {
          headers: {
            "Cache-Control": "public, max-age=300, must-revalidate",
            "X-Content-Type-Options": "nosniff",
            "Access-Control-Allow-Origin": "*",
          },
        });
      },
      POST: async ({ request }: { request: Request }) => {
        const view = setupView(request);
        if (view === "invalid") return invalid();
        return view === "setup"
          ? checkStructuredProductSetup(request)
          : earnFirstStructuralOfferHandlers.POST({ request });
      },
    },
  },
});
