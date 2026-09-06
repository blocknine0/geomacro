import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/bridge")({
  beforeLoad: () => {
    throw redirect({
      to: "/bridge-swap",
      replace: true,
    });
  },
});
