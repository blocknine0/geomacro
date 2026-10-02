import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/bridge-swap")({
  beforeLoad: () => {
    throw redirect({ to: "/onchain", replace: true });
  },
});
