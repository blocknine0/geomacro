import { createFileRoute } from "@tanstack/react-router";
import {
  b2PublicRuntimeConfigured,
  readB2PublicIntelligence,
  readB2PublicRisk,
} from "../lib/b2-live.server";
import { riskIndicesFromGlobalRisk } from "../lib/risk-indices-from-global-risk";

export const Route = createFileRoute("/api/public-production-health")({
  server: {
    handlers: {
      GET: async () => {
        const configured = b2PublicRuntimeConfigured();
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
          indices.indices.every((index) =>
            ["available", "unavailable"].includes(index.status),
          );

        const ok = configured && intelligenceReady && riskReady;
        return Response.json(
          {
            ok,
            service: "geomacro-public-production",
            serving_authority: "backblaze-b2",
            supabase_required_for_serving: false,
            b2_runtime_configured: configured,
            intelligence_ready: intelligenceReady,
            risk_indices_ready: riskReady,
            risk_verification_status: risk?.verificationStatus ?? null,
            risk_snapshot_as_of: risk?.snapshotAsOf ?? null,
          },
          {
            status: ok ? 200 : 503,
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
