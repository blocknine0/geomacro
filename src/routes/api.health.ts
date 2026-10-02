import { createFileRoute } from "@tanstack/react-router";
import { getCoinbaseX402Config } from "../lib/coinbase-x402.server";
import { geomacroSupabaseRuntimeMode } from "../lib/supabase-runtime-mode.server";

type X402RuntimeStatus = {
  state: "controlled_prelaunch" | "testnet" | "production" | "configuration_invalid";
  configured: boolean;
  environment: "prelaunch" | "testnet" | "production";
  network: string | null;
  exact_price_usdc: string | null;
};

function getX402RuntimeStatus(): X402RuntimeStatus {
  try {
    const config = getCoinbaseX402Config();
    if (!config) {
      return {
        state: "controlled_prelaunch",
        configured: false,
        environment: "prelaunch",
        network: null,
        exact_price_usdc: null,
      };
    }

    return {
      state: config.environment === "production" ? "production" : "testnet",
      configured: true,
      environment: config.environment,
      network: config.network,
      exact_price_usdc: config.priceUsdc,
    };
  } catch {
    return {
      state: "configuration_invalid",
      configured: false,
      environment: "prelaunch",
      network: null,
      exact_price_usdc: null,
    };
  }
}

function b2RuntimeConfigured() {
  if (typeof process === "undefined") return false;
  return Boolean(
    String(process.env.B2_KEY_ID ?? "").trim() &&
    String(process.env.B2_APPLICATION_KEY ?? "").trim(),
  );
}

export const Route = createFileRoute("/api/health")({
  server: {
    handlers: {
      GET: async () =>
        Response.json(
          {
            ok: true,
            service: "geomacro",
            alignment_contract: "github-main-b2-primary-supabase-standby-lovable-v2",
            source_authority: "github-main",
            production_data_authority: "backblaze-b2",
            production_data_runtime_configured: b2RuntimeConfigured(),
            commerce_control_plane: "cloudflare-durable-objects",
            supabase_role: "ingestion-recovery-standby",
            supabase_runtime_mode: geomacroSupabaseRuntimeMode(),
            x402: getX402RuntimeStatus(),
          },
          {
            status: 200,
            headers: {
              "Cache-Control": "no-store",
              "X-Content-Type-Options": "nosniff",
            },
          },
        ),
    },
  },
});
