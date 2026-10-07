import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/onchain")({
  beforeLoad: () => {
    throw redirect({ to: "/data-api", replace: true });
  },
});
