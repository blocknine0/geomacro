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
const CONTROL_PLANE_PUBLIC_URL =
  "https://geomacro-control-plane.daspallab202391.workers.dev";
const RISK_INDICES_PARENT_PROJECTION_PROOF_SCHEMA =
  "geomacro.public-risk-indices-parent-projection-proof.v1";
const GLOBAL_RISK_LIVE_KEY =
  "geomacro-evidence/v1/live/global-risk/latest.json.gz";
const HOT_SNAPSHOT_PROBES = [
  {
    key: "intelligence",
    product: "intelligence",
    schema: "geomacro.public-intelligence-live.v1",
    proofSchema: "geomacro.public-intelligence-live-proof.v1",
    b2Key: "geomacro-evidence/v1/live/public-intelligence/latest.json.gz",
    maxAgeMs: 6 * 60 * 60 * 1000,
  },
  {
    key: "global_risk",
    product: "global-risk",
    schema: "geomacro.public-global-risk-live.v1",
    proofSchema: "geomacro.public-global-risk-live-proof.v1",
    b2Key: "geomacro-evidence/v1/live/global-risk/latest.json.gz",
    maxAgeMs: 90 * 60 * 1000,
  },
  {
    key: "risk_indices",
    product: "risk-indices",
    schema: "geomacro.public-risk-indices-live.v1",
    proofSchema: "geomacro.public-risk-indices-live-proof.v1",
    b2Key: "geomacro-evidence/v1/live/risk-indices-independent/latest.json.gz",
    maxAgeMs: 90 * 60 * 1000,
  },
] as const;

const HASH_RE = /^[0-9a-f]{64}$/;

async function sha256Hex(value: string) {
  const digest = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
  );
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function verifyHotSnapshot(probe: (typeof HOT_SNAPSHOT_PROBES)[number]) {
  const unavailable = () => ({
    ok: false,
    serving_store: null,
    b2_sha256: null,
    payload_sha256: null,
    source_as_of: null,
  });

  try {
    const response = await fetch(
      `${CONTROL_PLANE_PUBLIC_URL}/v1/public/hot-snapshot/${probe.product}`,
      {
        headers: { Accept: "application/json", "Cache-Control": "no-cache" },
        signal: AbortSignal.timeout(4_500),
      },
    );
    if (!response.ok) return unavailable();

    const snapshot = await response.json() as {
      ok?: boolean;
      product?: string;
      schema?: string;
      generated_at?: string;
      source_as_of?: string;
      expires_at?: string;
      b2_object_key?: string;
      b2_sha256?: string;
      payload_sha256?: string;
      proof_schema?: string;
      verification_mode?: string;
      full_b2_readback_verified?: boolean;
      exact_gzip_restore_verified?: boolean;
      payload_json?: string;
    };

    const b2Sha256 = String(snapshot.b2_sha256 ?? "");
    const payloadSha256 = String(snapshot.payload_sha256 ?? "");
    const sourceAsOf = String(snapshot.source_as_of ?? "");
    const payloadJson = String(snapshot.payload_json ?? "");
    const generatedAtMs = Date.parse(String(snapshot.generated_at ?? ""));
    const sourceAsOfMs = Date.parse(sourceAsOf);
    const expiresAtMs = Date.parse(String(snapshot.expires_at ?? ""));
    const now = Date.now();
    const parentProjection =
      probe.product === "risk-indices" &&
      snapshot.proof_schema === RISK_INDICES_PARENT_PROJECTION_PROOF_SCHEMA &&
      snapshot.verification_mode === "global-risk-parent-projection";
    const expectedProofSchema = parentProjection
      ? RISK_INDICES_PARENT_PROJECTION_PROOF_SCHEMA
      : probe.proofSchema;
    const expectedB2Key = parentProjection ? GLOBAL_RISK_LIVE_KEY : probe.b2Key;

    if (
      snapshot.ok !== true ||
      snapshot.product !== probe.product ||
      snapshot.schema !== probe.schema ||
      snapshot.proof_schema !== expectedProofSchema ||
      snapshot.b2_object_key !== expectedB2Key ||
      snapshot.full_b2_readback_verified !== true ||
      snapshot.exact_gzip_restore_verified !== true ||
      !HASH_RE.test(b2Sha256) ||
      !HASH_RE.test(payloadSha256) ||
      !payloadJson ||
      !Number.isFinite(generatedAtMs) ||
      !Number.isFinite(sourceAsOfMs) ||
      !Number.isFinite(expiresAtMs) ||
      generatedAtMs > now + 5 * 60_000 ||
      now - generatedAtMs > 30 * 24 * 60 * 60 * 1000 ||
      sourceAsOfMs > now + 5 * 60_000 ||
      now - sourceAsOfMs > probe.maxAgeMs ||
      expiresAtMs <= now ||
      expiresAtMs <= sourceAsOfMs ||
      expiresAtMs > sourceAsOfMs + probe.maxAgeMs ||
      await sha256Hex(payloadJson) !== payloadSha256
    ) return unavailable();

    let payload: {
      schema?: string;
      generated_at?: string;
      source_project?: string;
      rows?: Array<{ category?: string }>;
      data?: {
        snapshotAsOf?: string;
        verificationStatus?: string;
        auditPersisted?: boolean;
        indices?: Array<{ status?: string }>;
      };
    };
    try {
      payload = JSON.parse(payloadJson);
    } catch {
      return unavailable();
    }

    if (
      payload.schema !== probe.schema ||
      payload.generated_at !== snapshot.generated_at ||
      payload.source_project !== SUPABASE_RECOVERY_PROJECT_REF ||
      (
        parentProjection &&
        (
          (payload as Record<string, unknown>).verification_mode !== "global-risk-parent-projection" ||
          (payload as Record<string, unknown>).parent_product !== "global-risk" ||
          (payload as Record<string, unknown>).parent_b2_sha256 !== b2Sha256 ||
          !HASH_RE.test(String((payload as Record<string, unknown>).parent_payload_sha256 ?? ""))
        )
      )
    ) return unavailable();

    if (probe.product === "intelligence") {
      const categories = new Set(
        (payload.rows ?? []).map((row) => String(row.category ?? "").toLowerCase()),
      );
      if (!["geopolitics", "macro", "rare_earth"].every((category) => categories.has(category))) {
        return unavailable();
      }
    } else {
      if (
        Date.parse(String(payload.data?.snapshotAsOf ?? "")) !== sourceAsOfMs ||
        payload.data?.verificationStatus !== "verified"
      ) return unavailable();
      if (probe.product === "global-risk" && payload.data?.auditPersisted !== true) {
        return unavailable();
      }
      if (
        probe.product === "risk-indices" &&
        (
          payload.data?.indices?.length !== 3 ||
          payload.data.indices.some((index) => index.status !== "available")
        )
      ) return unavailable();
    }

    return {
      ok: true,
      serving_store: "cloudflare-d1",
      b2_sha256: b2Sha256,
      payload_sha256: payloadSha256,
      source_as_of: sourceAsOf,
      proof_schema: snapshot.proof_schema ?? null,
      verification_mode:
        parentProjection ? "global-risk-parent-projection" : "direct-b2-readback",
      b2_object_key: snapshot.b2_object_key ?? null,
      parent_payload_sha256:
        parentProjection
          ? String((payload as Record<string, unknown>).parent_payload_sha256 ?? "")
          : null,
    };
  } catch {
    return unavailable();
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

  const [intelligence, globalRisk, riskIndices, ...hotSnapshots] = await Promise.all([
    configured ? readB2PublicIntelligence() : Promise.resolve(null),
    configured ? readB2PublicRisk() : Promise.resolve(null),
    readRiskIndicesEdge(),
    ...HOT_SNAPSHOT_PROBES.map(verifyHotSnapshot),
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
    HOT_SNAPSHOT_PROBES.map((probe, index) => [probe.key, hotSnapshots[index]]),
  );
  const globalRiskHot = hotSnapshots[1];
  const riskIndicesHot = hotSnapshots[2];
  const riskIndicesParentBindingReady =
    riskIndicesHot?.verification_mode !== "global-risk-parent-projection" ||
    (
      globalRiskHot?.ok === true &&
      riskIndicesHot?.b2_sha256 === globalRiskHot?.b2_sha256 &&
      riskIndicesHot?.source_as_of === globalRiskHot?.source_as_of &&
      riskIndicesHot?.b2_object_key === globalRiskHot?.b2_object_key &&
      riskIndicesHot?.parent_payload_sha256 === globalRiskHot?.payload_sha256
    );
  const d1HotServingReady =
    hotSnapshots.length === HOT_SNAPSHOT_PROBES.length &&
    hotSnapshots.every((proof) => proof.ok) &&
    riskIndicesParentBindingReady;

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
            Object.values(publicProduction.hot_snapshot_serving ?? {}).length === HOT_SNAPSHOT_PROBES.length &&
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
