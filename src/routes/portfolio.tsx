import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/portfolio")({
  beforeLoad: () => {
    throw redirect({ to: "/intelligence", replace: true });
  },
});
