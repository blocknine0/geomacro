import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/bridge")({
  beforeLoad: () => {
    throw redirect({ to: "/data-api", replace: true });
  },
});
