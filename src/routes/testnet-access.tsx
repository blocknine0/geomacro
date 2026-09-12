import { createFileRoute } from "@tanstack/react-router";

import { runH3Handler } from "@/lib/testnet-h3-bridge";
import testnetAccessHandler from "../../server/routes/testnet-access-canonical-wallet-first.get";

export const Route = createFileRoute("/testnet-access")({
  server: {
    handlers: {
      GET: async ({ request }) => runH3Handler(request, testnetAccessHandler as never),
    },
  },
});
