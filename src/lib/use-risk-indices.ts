import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PublicRiskIndices } from "./risk-indices.types";
import { reportError, type UserError } from "./user-errors";
import {
  PUBLIC_DATA_REQUEST_TIMEOUT_MS,
  withPublicRuntimeTimeout,
} from "./public-runtime-timeout";

export type RiskIndicesStatus = "loading" | "ready" | "updating" | "error";

type PublicRiskApiResponse =
  | { ok: true; data: PublicRiskIndices }
  | { ok: false; code?: string; message?: string };

async function fetchPublicRiskIndices(): Promise<PublicRiskIndices> {
  const response = await fetch("/api/public/risk-indices", {
    method: "GET",
    headers: { Accept: "application/json" },
    cache: "no-store",
    credentials: "same-origin",
  });
  const payload = (await response.json()) as PublicRiskApiResponse;
  if (!response.ok || !payload.ok) {
    throw new Error(!payload.ok ? payload.message ?? "Risk Indices unavailable." : "Risk Indices unavailable.");
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
        const response = await withPublicRuntimeTimeout(
          fetchPublicRiskIndices(),
          PUBLIC_DATA_REQUEST_TIMEOUT_MS,
          "Risk Indices request timed out.",
        );
        if (cancelled) return;

        hasData.current = true;
        setData(response);
        setError(null);
        setStatus("ready");
      } catch (caught) {
        if (cancelled) return;
        const userError = reportError(
          "useRiskIndices",
          caught,
          "refreshing the verified public risk indices",
        );
        setError(userError);
        setStatus(hasData.current ? "ready" : "error");
      }
    }

    void load();
    const timer = window.setInterval(() => void load(), refreshMs);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [refreshMs, reloadKey]);

  return useMemo(
    () => ({ data, status, error, retry }),
    [data, status, error, retry],
  );
}
