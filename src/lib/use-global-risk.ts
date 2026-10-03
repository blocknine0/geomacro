/**
 * Canonical public read model for the Global Risk Index workspace.
 *
 * The browser reads one app-owned API boundary. That endpoint accepts only the
 * verified B2 continuity package and rejects missing/truncated history. A
 * refresh failure never destroys an already verified reading and never creates
 * a synthetic replacement.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { reportError, toUserError, type UserError } from "@/lib/user-errors";
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

type PublicGlobalRiskResponse =
  | {
      ok: true;
      data: GlobalRisk;
      meta?: {
        authority?: string;
        history?: string;
        snapshot_as_of?: string;
      };
    }
  | {
      ok: false;
      code?: string;
      message?: string;
    };

const REQUEST_TIMEOUT_MS = 8_000;

export function useGlobalRisk(refreshMs = 5 * 60 * 1000) {
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
        const response = await fetch("/api/public/global-risk", {
          method: "GET",
          headers: { Accept: "application/json" },
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
        const body = (await response.json()) as PublicGlobalRiskResponse;
        if (cancelled) return;

        if (!response.ok || !body.ok) {
          throw new Error(
            !body.ok && body.message
              ? body.message
              : `Global Risk read failed with HTTP ${response.status}`,
          );
        }

        const next = body.data;
        hasData.current = true;
        setData(next);
        const asOf = new Date(next.snapshotAsOf).getTime();
        setUpdatedAt(Number.isFinite(asOf) ? asOf : Date.now());
        setError(null);
        setStatus("ready");
      } catch (err) {
        if (cancelled) return;

        reportError(
          "useGlobalRisk",
          err,
          "refreshing the verified Global Risk continuity package",
        );
        if (hasData.current) {
          setError(null);
          setStatus("ready");
        } else {
          setError(toUserError(err));
          setStatus("error");
        }
      }
    }

    void load();
    const id = setInterval(() => void load(), refreshMs);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [reloadKey, refreshMs]);

  return useMemo(
    () => ({ data, status, error, updatedAt, retry }),
    [data, status, error, updatedAt, retry],
  );
}
