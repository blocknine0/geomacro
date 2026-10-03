import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/testnet-access")({
  beforeLoad: () => {
    throw redirect({ to: "/data-api", replace: true });
  },
});
