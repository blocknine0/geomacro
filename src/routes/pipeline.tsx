import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/pipeline")({
  beforeLoad: () => {
    throw redirect({ to: "/research", replace: true });
  },
});
