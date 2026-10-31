import { createFileRoute, redirect } from "@tanstack/react-router";

/** Previously separate API page is now part of the canonical Store & API.
 * Preserve existing bookmarks and deep links without duplicate pricing or SEO. */
export const Route = createFileRoute("/data-api")({
  beforeLoad: () => {
    throw redirect({ to: "/pricing", replace: true });
  },
});
