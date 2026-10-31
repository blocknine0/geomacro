import {isIntelligenceProofSchema} from "../../lib/intelligence-publication-authority.mjs";
import { createFileRoute } from "@tanstack/react-router";
import {
  readB2PublicIntelligence,
  readB2PublicRisk,
} from "../lib/b2-live.server";
import { getCoinbaseX402Config } from "../lib/coinbase-x402.server";
import { readRiskIndicesEdge } from "../lib/risk-indices-edge.server";
import { geomacroSupabaseRuntimeMode } from "../lib/supabase-runtime-mode.server";
import { qualifyPublicCurrentReadiness } from "../lib/public-production-current-readiness";
import { probeLiveStructuredDeepHealth } from "../lib/live-structured-deep-health.server";
import { probeFreeDerivedDeepHealth } from "../lib/free-derived-deep-health.server";
import {verifiedBaselineHealth} from "../lib/verified-baseline-health";

const SUPABASE_RECOVERY_PROJECT_REF = "ldpwajisioljyjtojvfx";
const CONTROL_PLANE_PUBLIC_URL =
  "https://geomacro-control-plane.daspallab202391.workers.dev";
const HOT_SNAPSHOT_PROBES = [
  {
    key: "intelligence",
    product: "intelligence",
    schema: "geomacro.public-intelligence-live.v1",
    proofSchema: "geomacro.public-intelligence-live-proof.v1",
    b2Key: "geomacro-evidence/v1/live/public-intelligence/latest.json.gz",
    maxAgeMs: 12 * 60 * 60 * 1000,
    liveFreshnessMs: 60 * 60 * 1000,
  },
  {
    key: "global_risk",
    product: "global-risk",
    schema: "geomacro.public-global-risk-live.v1",
    proofSchema: "geomacro.public-global-risk-live-proof.v1",
    b2Key: "geomacro-evidence/v1/live/global-risk/latest.json.gz",
    maxAgeMs: 180 * 60 * 1000,
    liveFreshnessMs: 60 * 60 * 1000,
  },
  {
    key: "risk_indices",
    product: "risk-indices",
    schema: "geomacro.public-risk-indices-live.v1",
    proofSchema: "geomacro.public-risk-indices-live-proof.v1",
    b2Key: "geomacro-evidence/v1/live/risk-indices-independent/latest.json.gz",
    maxAgeMs: 180 * 60 * 1000,
    liveFreshnessMs: 60 * 60 * 1000,
  },
] as const;

const HASH_RE = /^[0-9a-f]{64}$/;
const GLOBAL_RISK_CURRENT_PROOF_SCHEMA = "geomacro.public-global-risk-current-proof.v1";
const GLOBAL_RISK_CURRENT_PROOF_MODE = "independent-gri-proof-over-b2-baseline";

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
      baseline_b2_readback_verified?: boolean;
      baseline_exact_gzip_restore_verified?: boolean;
      current_b2_readback_verified?: boolean;
      current_b2_snapshot_promoted?: boolean;
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

    const globalRiskRecovery =
      probe.product === "global-risk" &&
      snapshot.proof_schema === GLOBAL_RISK_CURRENT_PROOF_SCHEMA &&
      snapshot.verification_mode === GLOBAL_RISK_CURRENT_PROOF_MODE;
    const directB2 =
      (snapshot.proof_schema === probe.proofSchema || probe.product === "intelligence" && isIntelligenceProofSchema(snapshot.proof_schema)) &&
      snapshot.full_b2_readback_verified === true &&
      snapshot.exact_gzip_restore_verified === true &&
      snapshot.current_b2_readback_verified !== false &&
      snapshot.current_b2_snapshot_promoted !== false;

    if (
      snapshot.ok !== true ||
      snapshot.product !== probe.product ||
      snapshot.schema !== probe.schema ||
      !(
        snapshot.proof_schema === probe.proofSchema ||
        probe.product === "intelligence" && isIntelligenceProofSchema(snapshot.proof_schema) ||
        probe.product === "global-risk" &&
          snapshot.proof_schema === GLOBAL_RISK_CURRENT_PROOF_SCHEMA &&
          snapshot.verification_mode === GLOBAL_RISK_CURRENT_PROOF_MODE
      ) ||
      snapshot.b2_object_key !== probe.b2Key ||
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
      // Valid signed source <=12h/3h does not imply current/live <=60min.
      now - sourceAsOfMs > probe.liveFreshnessMs ||
      expiresAtMs <= now ||
      expiresAtMs <= sourceAsOfMs ||
      expiresAtMs > sourceAsOfMs + probe.maxAgeMs ||
      await sha256Hex(payloadJson) !== payloadSha256 ||
      (!directB2 && !globalRiskRecovery) ||
      (
        globalRiskRecovery &&
        (
          snapshot.baseline_b2_readback_verified !== true ||
          snapshot.baseline_exact_gzip_restore_verified !== true ||
          snapshot.current_b2_readback_verified !== false ||
          snapshot.current_b2_snapshot_promoted !== false
        )
      )
    ) return unavailable();

    let payload: {
      schema?: string;
      generated_at?: string;
      source_project?: string;
      rows?: Array<{ category?: string }>;
      verification_mode?: string;
      baseline_b2_sha256?: string;
      baseline_payload_sha256?: string;
      baseline_source_run_id?: string;
      baseline_generated_at?: string;
      current_b2_snapshot_promoted?: boolean;
      current_proof?: Record<string, unknown>;
      data?: {
        snapshotAsOf?: string;
        verificationStatus?: string;
        auditPersisted?: boolean;
        methodologyVersion?: string;
        proofHash?: string;
        evidenceHash?: string;
        calculationHash?: string;
        dispositionHash?: string;
        inputHash?: string;
        methodologyHash?: string;
        changeHash?: string;
        candidateEventCount?: number;
        reconciliationResidual?: number;
        changeResidual?: number;
        domainIndices?: Record<string, { series?: Record<string, { buckets?: unknown[] }> }>;
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
      payload.source_project !== SUPABASE_RECOVERY_PROJECT_REF
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
      if (probe.product === "global-risk") {
        if (payload.data?.auditPersisted !== true || payload.data?.methodologyVersion !== "gri-v1.2.0") {
          return unavailable();
        }
        if (globalRiskRecovery) {
          const currentProof = payload.current_proof ?? {};
          const domains = payload.data?.domainIndices ?? {};
          const hashes = [
            ["proofHash", "proofHash"],
            ["evidenceHash", "evidenceHash"],
            ["calculationHash", "calculationHash"],
            ["dispositionHash", "dispositionHash"],
            ["inputHash", "inputHash"],
            ["methodologyHash", "methodologyHash"],
            ["changeHash", "changeHash"],
          ] as const;
          if (
            payload.verification_mode !== GLOBAL_RISK_CURRENT_PROOF_MODE ||
            payload.current_b2_snapshot_promoted !== false ||
            payload.baseline_b2_sha256 !== b2Sha256 ||
            !HASH_RE.test(String(payload.baseline_payload_sha256 ?? "")) ||
            !/^\d{1,20}$/.test(String(payload.baseline_source_run_id ?? "")) ||
            !Number.isFinite(Date.parse(String(payload.baseline_generated_at ?? ""))) ||
            Date.now() - Date.parse(String(payload.baseline_generated_at ?? "")) > 30 * 24 * 60 * 60 * 1000 ||
            !hashes.every(([dataKey, proofKey]) =>
              HASH_RE.test(String(payload.data?.[dataKey] ?? "")) &&
              currentProof[proofKey] === payload.data?.[dataKey]
            ) ||
            Number(currentProof.candidateEventCount) !== Number(payload.data?.candidateEventCount) ||
            Number(currentProof.reconciliationResidual) !== Number(payload.data?.reconciliationResidual) ||
            Number(currentProof.changeResidual) !== Number(payload.data?.changeResidual) ||
            !["geopolitics", "macro", "rare_earth"].every((key) => {
              const domain = domains[key];
              const seven = domain?.series?.["7D"]?.buckets;
              const thirty = domain?.series?.["30D"]?.buckets;
              return Array.isArray(seven) && seven.length >= 2 &&
                Array.isArray(thirty) && thirty.length >= seven.length;
            })
          ) return unavailable();
        }
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
      verification_mode: globalRiskRecovery ? GLOBAL_RISK_CURRENT_PROOF_MODE : "direct-b2-readback",
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
  if (!deep) {
    return {
      deep_checked: false,
      serving_authority: "backblaze-b2",
      hot_snapshot_serving: null,
      current_hot_product_ready: null,
      last_verified_baseline_readable: null,
      supabase_required_for_serving: false,
      // Shallow health cannot attest to deployed edge configuration without
      // executing the bounded independent origin probes.
      b2_runtime_configured: null,
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
    // Website/Lovable needs no private S3 keys. Prove reachability via
    // the independently verified edge authority; a private local B2
    // secret is not a public runtime readiness prerequisite.
    readB2PublicIntelligence(),
    readB2PublicRisk(),
    readRiskIndicesEdge(),
    ...HOT_SNAPSHOT_PROBES.map(verifyHotSnapshot),
  ]);

  const categories = new Set(
    (intelligence ?? []).map((row) => String(row.category ?? "").toLowerCase()),
  );
  // A readable historical B2 baseline is not a CURRENT paid hot snapshot.
  const baselineIntelligenceReady =
    Boolean(intelligence?.length) &&
    ["geopolitics", "macro", "rare_earth"].every((category) => categories.has(category));
  const baselineGlobalRiskReady = globalRisk?.verificationStatus === "verified";
  const baselineRiskIndicesReady =
    riskIndices?.verificationStatus === "verified" &&
    riskIndices.indices.length === 3 &&
    riskIndices.indices.every((index) => index.status === "available");
  const hotSnapshotServing = Object.fromEntries(
    HOT_SNAPSHOT_PROBES.map((probe, index) => [probe.key, hotSnapshots[index]]),
  );
  const readiness = qualifyPublicCurrentReadiness(
    {
      intelligence: baselineIntelligenceReady,
      global_risk: baselineGlobalRiskReady,
      risk_indices: baselineRiskIndicesReady,
    },
    {
      intelligence: hotSnapshots[0],
      global_risk: hotSnapshots[1],
      risk_indices: hotSnapshots[2],
    },
  );
  const intelligenceReady = readiness.current_hot_product_ready.intelligence;
  const globalRiskReady = readiness.current_hot_product_ready.global_risk;
  const riskIndicesReady = readiness.current_hot_product_ready.risk_indices;
  const d1HotServingReady = readiness.all_current_hot_products_ready;

  return {
    deep_checked: true,
    serving_authority: d1HotServingReady
      ? "backblaze-b2-durable-truth-cloudflare-d1-verified-hot"
      : "backblaze-b2-with-d1-hot-snapshot-required",
    hot_snapshot_serving: hotSnapshotServing,
    current_hot_product_ready: readiness.current_hot_product_ready,
    last_verified_baseline_readable: readiness.last_verified_baseline_readable,
    supabase_required_for_serving: false,
    // Authority is proven by real validated edge responses, not presence
    // of private B2 credentials in this public app process.
    b2_runtime_configured:
      baselineIntelligenceReady && baselineGlobalRiskReady && baselineRiskIndicesReady,
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
        const url = new URL(request.url);
        const deep = new URL(request.url).searchParams.get("deep") === "1";
        const profile = url.searchParams.get("profile");
        // Separate truth contract: do not make legacy signed-GRO/B2/D1 checks
        // pass by treating unsigned stateless source observations as signed.
        if (profile !== null) {
          if ((profile !== "live-structured" && profile !== "free-derived" && profile !== "verified-baseline") || !deep ||
              url.searchParams.getAll("profile").length !== 1 ||
              url.searchParams.getAll("deep").length !== 1 ||
              [...url.searchParams.keys()].some(key =>
                key !== "deep" && key !== "profile")) {
            return Response.json({ok:false,error:"HEALTH_PROFILE_INVALID",
              accepted_profiles:["live-structured","free-derived","verified-baseline"],
              chargeable:false},
              {status:400,headers:{"Cache-Control":"no-store",
                "X-Content-Type-Options":"nosniff"}});
          }
          // Actual B2/Edge-backed baseline readiness is its own service
          // health profile. Never return this 200 in the signed paid
          // /api/health?deep=1 contract and never elevate payment status.
          if(profile==="verified-baseline"){
            const verified=await getPublicProductionReadiness(true);
            const products=["intelligence","global_risk","risk_indices"] as const;
            const baseline=Object.fromEntries(products.map(key=>
              [key,verified.last_verified_baseline_readable?.[key]===true]));
            const live=Object.fromEntries(products.map(key=>
              [key,verified.current_hot_product_ready?.[key]===true]));
            const result=verifiedBaselineHealth({
              last_verified_baseline_readable:baseline as Record<(typeof products)[number],boolean>,
              current_hot_product_ready:live as Record<(typeof products)[number],boolean>,
            });
            return Response.json(result.body,{status:result.statusCode,
              headers:{"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}});
          }
          // Free D1 news and signed hot products are independent products.
          // An authentic free readback cannot certify GRO, GRI or x402.
          if (profile === "free-derived") {
            const free = await probeFreeDerivedDeepHealth();
            return Response.json(free.body,{status:free.statusCode,
              headers:{"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}});
          }
          const scoped = await probeLiveStructuredDeepHealth();
          return Response.json(scoped.body,{status:scoped.statusCode,
            headers:{"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}});
        }
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
