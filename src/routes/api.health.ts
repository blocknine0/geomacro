import { createFileRoute } from "@tanstack/react-router";
import {
  b2PublicRuntimeConfigured,
  readB2PublicIntelligence,
  readB2PublicRisk,
} from "../lib/b2-live.server";
import { getCoinbaseX402Config } from "../lib/coinbase-x402.server";
import { readRiskIndicesEdge } from "../lib/risk-indices-edge.server";
import { geomacroSupabaseRuntimeMode } from "../lib/supabase-runtime-mode.server";

const SUPABASE_RECOVERY_PROJECT_REF = "ldpwajisioljyjtojvfx";
const VERIFIED_HOT_EDGE_PROOF = "full-readback-hash-exact-restore";
const HOT_EDGE_PROBES = [
  {
    product: "intelligence",
    url: "https://geomacro-intelligence.daspallab202391.workers.dev/intelligence",
    authority: "backblaze-b2-intelligence-edge",
    schema: "geomacro.public-intelligence-live.v1",
    maxAgeMs: 6 * 60 * 60 * 1000,
  },
  {
    product: "global_risk",
    url: "https://geomacro-global-risk.daspallab202391.workers.dev/global-risk",
    authority: "backblaze-b2-verified-edge",
    schema: "geomacro.public-global-risk-live.v1",
    maxAgeMs: 90 * 60 * 1000,
  },
  {
    product: "risk_indices",
    url: "https://geomacro-risk-indices.daspallab202391.workers.dev/risk-indices",
    authority: "backblaze-b2-risk-indices-edge",
    schema: "geomacro.public-risk-indices-live.v1",
    maxAgeMs: 90 * 60 * 1000,
  },
];

async function verifyHotEdge(probe: (typeof HOT_EDGE_PROBES)[number]) {
  try {
    const response = await fetch(probe.url, {
      headers: { Accept: "application/json", "Cache-Control": "no-cache" },
      signal: AbortSignal.timeout(4_500),
    });
    if (
      !response.ok ||
      response.headers.get("x-geomacro-authority") !== probe.authority ||
      response.headers.get("x-geomacro-serving-store") !== "cloudflare-d1" ||
      response.headers.get("x-geomacro-b2-verification") !== VERIFIED_HOT_EDGE_PROOF
    ) return { ok: false, serving_store: null, b2_sha256: null, payload_sha256: null };
    const b2Sha256 = String(response.headers.get("x-geomacro-b2-sha256") ?? "");
    const payloadSha256 = String(response.headers.get("x-geomacro-d1-payload-sha256") ?? "");
    const sourceAsOf = String(response.headers.get("x-geomacro-source-as-of") ?? "");
    const body = await response.json() as { schema?: string; generated_at?: string };
    const generatedAt = Date.parse(String(body.generated_at ?? ""));
    const sourceAsOfMs = Date.parse(sourceAsOf);
    const age = Date.now() - generatedAt;
    const sourceAge = Date.now() - sourceAsOfMs;
    const ok =
      body.schema === probe.schema &&
      /^[0-9a-f]{64}$/.test(b2Sha256) &&
      /^[0-9a-f]{64}$/.test(payloadSha256) &&
      Number.isFinite(age) && age >= -5 * 60_000 && age <= 30 * 24 * 60 * 60 * 1000 &&
      Number.isFinite(sourceAge) && sourceAge >= -5 * 60_000 && sourceAge <= probe.maxAgeMs;
    return {
      ok,
      serving_store: ok ? "cloudflare-d1" : null,
      b2_sha256: ok ? b2Sha256 : null,
      payload_sha256: ok ? payloadSha256 : null,
      source_as_of: ok ? sourceAsOf : null,
    };
  } catch {
    return { ok: false, serving_store: null, b2_sha256: null, payload_sha256: null };
  }
}

type X402RuntimeStatus = {
  state: "controlled_prelaunch" | "production" | "configuration_invalid";
  configured: boolean;
  environment: "prelaunch" | "production";
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

    if (config.environment !== "production") {
      return {
        state: "controlled_prelaunch",
        configured: true,
        environment: "prelaunch",
        network: null,
        exact_price_usdc: null,
      };
    }

    return {
      state: "production",
      configured: true,
      environment: "production",
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
      hot_snapshot_serving: null,
      supabase_required_for_serving: false,
      b2_runtime_configured: configured,
      intelligence_ready: null,
      global_risk_ready: null,
      risk_indices_ready: null,
      risk_indices_authority: null,
      risk_verification_status: null,
      risk_snapshot_as_of: null,
      risk_indices_snapshot_as_of: null,
    };
  }

  const [intelligence, globalRisk, riskIndices, ...hotEdges] = await Promise.all([
    configured ? readB2PublicIntelligence() : Promise.resolve(null),
    configured ? readB2PublicRisk() : Promise.resolve(null),
    readRiskIndicesEdge(),
    ...HOT_EDGE_PROBES.map(verifyHotEdge),
  ]);

  const categories = new Set(
    (intelligence ?? []).map((row) => String(row.category ?? "").toLowerCase()),
  );
  const intelligenceReady =
    Boolean(intelligence?.length) &&
    ["geopolitics", "macro", "rare_earth"].every((category) => categories.has(category));

  const globalRiskReady = globalRisk?.verificationStatus === "verified";
  const riskIndicesReady =
    riskIndices?.verificationStatus === "verified" &&
    riskIndices.indices.length === 3 &&
    riskIndices.indices.every((index) => index.status === "available");
  const hotSnapshotServing = Object.fromEntries(
    HOT_EDGE_PROBES.map((probe, index) => [probe.product, hotEdges[index]]),
  );
  const d1HotServingReady = hotEdges.length === HOT_EDGE_PROBES.length && hotEdges.every((proof) => proof.ok);

  return {
    deep_checked: true,
    serving_authority: d1HotServingReady
      ? "backblaze-b2-durable-truth-cloudflare-d1-verified-hot"
      : "backblaze-b2-with-d1-hot-snapshot-required",
    hot_snapshot_serving: hotSnapshotServing,
    supabase_required_for_serving: false,
    b2_runtime_configured: configured,
    intelligence_ready: intelligenceReady,
    global_risk_ready: globalRiskReady,
    risk_indices_ready: riskIndicesReady,
    risk_indices_authority: riskIndicesReady ? "backblaze-b2-risk-indices-edge" : null,
    risk_verification_status: globalRisk?.verificationStatus ?? null,
    risk_snapshot_as_of: globalRisk?.snapshotAsOf ?? null,
    risk_indices_snapshot_as_of: riskIndices?.snapshotAsOf ?? null,
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
            publicProduction.global_risk_ready === true &&
            publicProduction.risk_indices_ready === true &&
            publicProduction.risk_verification_status === "verified" &&
            Object.values(publicProduction.hot_snapshot_serving ?? {}).length === HOT_EDGE_PROBES.length &&
            Object.values(publicProduction.hot_snapshot_serving ?? {}).every((proof) => proof.ok));

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
