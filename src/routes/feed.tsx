import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * Legacy public feed route.
 *
 * The commercial website has one canonical live-intelligence surface:
 * `/intelligence`. Keep this redirect so old bookmarks and external links do
 * not break while avoiding two competing public product identities.
 */
export const Route = createFileRoute("/feed")({
  beforeLoad: () => {
    throw redirect({ to: "/intelligence", replace: true });
  },
});
