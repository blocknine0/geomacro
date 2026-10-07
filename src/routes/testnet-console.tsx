import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/testnet-console")({
  beforeLoad: () => {
    throw redirect({ to: "/data-api", replace: true });
  },
});
