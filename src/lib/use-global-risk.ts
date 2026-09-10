/**
 * Canonical public read model for every Global Risk Index surface.
 *
 * Public pages no longer query Supabase directly from the browser. Every GRI
 * surface calls the same same-origin server function, which reads the app-owned
 * authoritative data store, verifies freshness/proof requirements and returns
 * one normalized public contract. There is no synthetic client fallback.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getPublicGlobalRisk } from "@/lib/public-risk.functions";
import { reportError, type UserError } from "@/lib/user-errors";
import {
  GRI_METHODOLOGY,
  type Bucket,
  type GlobalRisk,
  type RiskDriver,
  type RiskRow,
  type RiskStatus,
  type Timeframe,
  type TimeframeSeries,
} from "@/lib/global-risk.types";

export {
  GRI_METHODOLOGY,
  type Bucket,
  type GlobalRisk,
  type RiskDriver,
  type RiskRow,
  type RiskStatus,
  type Timeframe,
  type TimeframeSeries,
};

export function useGlobalRisk(refreshMs = 5 * 60 * 1000) {
  const loadPublicRisk = useServerFn(getPublicGlobalRisk);
  const [data, setData] = useState<GlobalRisk | null>(null);
  const [status, setStatus] = useState<RiskStatus>("loading");
  const [error, setError] = useState<UserError | null>(null);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const hasData = useRef(false);

  const retry = useCallback(() => setReloadKey((key) => key + 1), []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setStatus(hasData.current ? "updating" : "loading");
      try {
        const result = await loadPublicRisk({ data: {} });
        if (cancelled) return;

        if (!result.ok) {
          hasData.current = false;
          setData(null);
          setUpdatedAt(null);
          setError({
            message: result.message,
            detail: result.code,
            retryable: true,
          });
          setStatus("error");
          return;
        }

        const next = result.data;
        hasData.current = true;
        setData(next);
        const asOf = new Date(next.snapshotAsOf).getTime();
        setUpdatedAt(Number.isFinite(asOf) ? asOf : Date.now());
        setError(null);
        setStatus("ready");
      } catch (err) {
        if (cancelled) return;
        hasData.current = false;
        setData(null);
        setUpdatedAt(null);
        setError(
          reportError(
            "useGlobalRisk",
            err,
            "loading the canonical global risk index",
          ),
        );
        setStatus("error");
      }
    }

    void load();
    const id = setInterval(() => void load(), refreshMs);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [loadPublicRisk, reloadKey, refreshMs]);

  return useMemo(
    () => ({ data, status, error, updatedAt, retry }),
    [data, status, error, updatedAt, retry],
  );
}
