import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getPublicRiskIndices } from "./public-risk-indices.functions";
import type { PublicRiskIndices } from "./risk-indices.types";
import { reportError, type UserError } from "./user-errors";
import {
  PUBLIC_DATA_REQUEST_TIMEOUT_MS,
  withPublicRuntimeTimeout,
} from "./public-runtime-timeout";

export type RiskIndicesStatus = "loading" | "ready" | "updating" | "error";

export function useRiskIndices(refreshMs = 5 * 60 * 1000) {
  const run = useServerFn(getPublicRiskIndices);
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
          run({ data: {} }),
          PUBLIC_DATA_REQUEST_TIMEOUT_MS,
          "Risk Indices request timed out.",
        );
        if (cancelled) return;
        if (!response.ok) throw new Error(response.message);

        hasData.current = true;
        setData(response.data);
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
  }, [refreshMs, reloadKey, run]);

  return useMemo(
    () => ({ data, status, error, retry }),
    [data, status, error, retry],
  );
}
