import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PublicRiskIndices } from "./risk-indices.types";
import { PUBLIC_RISK_INDICES_CONTRACT_VERSION } from "./risk-indices.types";
import { reportError, type UserError } from "./user-errors";

const PUBLIC_RISK_EDGE_URL =
  "https://ldpwajisioljyjtojvfx.supabase.co/functions/v1/public-risk-indices";

export type RiskIndicesStatus = "loading" | "ready" | "updating";

function isValidPayload(value: unknown): value is { ok: true; data: PublicRiskIndices } {
  if (!value || typeof value !== "object") return false;
  const body = value as Record<string, unknown>;
  if (body.ok !== true || !body.data || typeof body.data !== "object") return false;

  const data = body.data as Record<string, unknown>;
  if (data.contractVersion !== PUBLIC_RISK_INDICES_CONTRACT_VERSION) return false;
  if (data.parentMethodologyVersion !== "gri-v1.2.0") return false;
  if (data.proofVersion !== "gri-proof-v1.2.0") return false;
  if (data.verificationStatus !== "verified") return false;
  if (!Array.isArray(data.indices) || data.indices.length !== 3) return false;

  const keys = data.indices
    .map((item) => (item && typeof item === "object" ? (item as Record<string, unknown>).key : null))
    .sort()
    .join(",");
  return keys === "critical_minerals,geopolitics,macro";
}

async function readPublicRiskIndices(): Promise<PublicRiskIndices> {
  const response = await fetch(PUBLIC_RISK_EDGE_URL, {
    method: "GET",
    headers: { accept: "application/json" },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Authoritative public risk edge returned HTTP ${response.status}`);
  }

  const payload: unknown = await response.json();
  if (!isValidPayload(payload)) {
    throw new Error("Authoritative public risk edge returned an invalid verified payload");
  }

  return payload.data;
}

export function useRiskIndices(refreshMs = 5 * 60 * 1000) {
  const [data, setData] = useState<PublicRiskIndices | null>(null);
  const [status, setStatus] = useState<RiskIndicesStatus>("loading");
  const [error, setError] = useState<UserError | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const hasData = useRef(false);

  const retry = useCallback(() => setReloadKey((value) => value + 1), []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setStatus(hasData.current ? "updating" : "loading");
      try {
        const response = await readPublicRiskIndices();
        if (cancelled) return;

        hasData.current = true;
        setData(response);
        setError(null);
        setStatus("ready");
      } catch (caught) {
        if (cancelled) return;
        reportError(
          "useRiskIndices",
          caught,
          "refreshing the verified public risk indices",
        );
        setError(null);
        setStatus(hasData.current ? "ready" : "loading");
      }
    }

    void load();
    const timer = setInterval(() => void load(), refreshMs);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [refreshMs, reloadKey]);

  return useMemo(
    () => ({ data, status, error, retry }),
    [data, status, error, retry],
  );
}
