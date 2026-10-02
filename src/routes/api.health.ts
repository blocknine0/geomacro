import { createFileRoute } from "@tanstack/react-router";
import {
  b2PublicRuntimeConfigured,
  readB2PublicIntelligence,
  readB2PublicRisk,
} from "../lib/b2-live.server";
import { getCoinbaseX402Config } from "../lib/coinbase-x402.server";
import { riskIndicesFromGlobalRisk } from "../lib/risk-indices-from-global-risk";
import { geomacroSupabaseRuntimeMode } from "../lib/supabase-runtime-mode.server";

const SUPABASE_RECOVERY_PROJECT_REF = "ldpwajisioljyjtojvfx";

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

async function getPublicProductionReadiness(deep: boolean) {
  const configured = b2PublicRuntimeConfigured();
  if (!deep) {
    return {
      deep_checked: false,
      serving_authority: "backblaze-b2",
      supabase_required_for_serving: false,
      b2_runtime_configured: configured,
      intelligence_ready: null,
      risk_indices_ready: null,
      risk_verification_status: null,
      risk_snapshot_as_of: null,
    };
  }

  const [intelligence, risk] = configured
    ? await Promise.all([readB2PublicIntelligence(), readB2PublicRisk()])
    : [null, null] as const;

  const categories = new Set(
    (intelligence ?? []).map((row) => String(row.category ?? "").toLowerCase()),
  );
  const intelligenceReady =
    Boolean(intelligence?.length) &&
    ["geopolitics", "macro", "rare_earth"].every((category) => categories.has(category));

  const indices = risk ? riskIndicesFromGlobalRisk(risk) : null;
  const riskReady =
    Boolean(risk) &&
    indices?.verificationStatus === "verified" &&
    indices.indices.length === 3 &&
    indices.indices.every((index) => ["available", "unavailable"].includes(index.status));

  return {
    deep_checked: true,
    serving_authority: "backblaze-b2",
    supabase_required_for_serving: false,
    b2_runtime_configured: configured,
    intelligence_ready: intelligenceReady,
    risk_indices_ready: riskReady,
    risk_verification_status: risk?.verificationStatus ?? null,
    risk_snapshot_as_of: risk?.snapshotAsOf ?? null,
  };
}

export const Route = createFileRoute("/api/health")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const deep = new URL(request.url).searchParams.get("deep") === "1";
        const publicProduction = await getPublicProductionReadiness(deep);
        const deepReady =
          !deep ||
          (publicProduction.b2_runtime_configured &&
            publicProduction.intelligence_ready === true &&
            publicProduction.risk_indices_ready === true &&
            publicProduction.risk_verification_status === "verified");

        return Response.json(
          {
            ok: deepReady,
            service: "geomacro",
            alignment_contract: "github-main-b2-primary-supabase-standby-lovable-v2",
            source_authority: "github-main",
            production_data_authority: "backblaze-b2",
            production_data_runtime_configured: publicProduction.b2_runtime_configured,
            public_production: publicProduction,
            commerce_control_plane: "cloudflare-durable-objects",
            supabase_role: "ingestion-recovery-standby",
            supabase_recovery_project_ref: SUPABASE_RECOVERY_PROJECT_REF,
            supabase_runtime_mode: geomacroSupabaseRuntimeMode(),
            // Temporary compatibility for the isolated legacy Testnet monitor.
            // This does not describe or select the customer-facing production
            // data authority; the top-level v2 contract above is authoritative.
            legacy_testnet_alignment: {
              alignment_contract: "github-main-external-supabase-lovable-v1",
              database_authority: "external-supabase",
              supabase_project_ref: SUPABASE_RECOVERY_PROJECT_REF,
            },
            x402: getX402RuntimeStatus(),
          },
          {
            status: deepReady ? 200 : 503,
            headers: {
              "Cache-Control": "no-store",
              "X-Content-Type-Options": "nosniff",
            },
          },
        );
      },
    },
  },
});
