import { createFileRoute } from "@tanstack/react-router";

import { runH3Handler } from "@/lib/testnet-h3-bridge";
import testnetConsoleHandler from "../../server/routes/testnet-console.get";

export const Route = createFileRoute("/testnet-console")({
  server: {
    handlers: {
      GET: async ({ request }) => runH3Handler(request, testnetConsoleHandler as never),
    },
  },
});
