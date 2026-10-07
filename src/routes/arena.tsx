import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/arena")({
  beforeLoad: () => {
    throw redirect({ to: "/intelligence", replace: true });
  },
});
