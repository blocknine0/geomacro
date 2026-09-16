/**
 * Canonical public read model for legacy Global Risk Index consumers.
 *
 * During the public migration to separate risk indices, existing homepage,
 * institutional and agent-facing consumers keep this compatibility hook. The
 * server attempts the app-owned database first and then the authoritative
 * Supabase Edge read. A refresh failure never destroys an already verified
 * reading and never turns the website into a visible runtime-error surface.
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
        const response = await loadPublicRisk({ data: {} });
        if (cancelled) return;

        if (!response.ok) {
          throw new Error(response.message);
        }

        const next = response.data;
        hasData.current = true;
        setData(next);
        const asOf = new Date(next.snapshotAsOf).getTime();
        setUpdatedAt(Number.isFinite(asOf) ? asOf : Date.now());
        setError(null);
        setStatus("ready");
      } catch (err) {
        if (cancelled) return;

        // Report diagnostics without converting public risk surfaces into an
        // error card. If a verified reading already exists, keep it visible.
        // On a cold start, keep the neutral loading state and retry on the
        // normal refresh cadence or explicit retry action.
        reportError(
          "useGlobalRisk",
          err,
          "refreshing the verified risk index compatibility reading",
        );
        setError(null);
        setStatus(hasData.current ? "ready" : "loading");
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
