import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getPublicRiskIndices } from "./public-risk-indices.functions";
import type { PublicRiskIndices } from "./risk-indices.types";
import { PUBLIC_RISK_INDICES_CONTRACT_VERSION } from "./risk-indices.types";
import { reportError, type UserError } from "./user-errors";

const CACHE_KEY = "geomacro:risk-indices:last-verified:v1";

export type RiskIndicesStatus = "loading" | "ready" | "updating" | "error";

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

function readCachedVerifiedPayload(): PublicRiskIndices | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isValidPayload(parsed) ? parsed.data : null;
  } catch {
    return null;
  }
}

function storeVerifiedPayload(data: PublicRiskIndices) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify({ ok: true, data }));
  } catch {
    // Storage may be blocked or quota-limited. The live response remains usable.
  }
}

export function useRiskIndices(refreshMs = 5 * 60 * 1000) {
  const loadPublicRiskIndices = useServerFn(getPublicRiskIndices);
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
        const response = await loadPublicRiskIndices({ data: {} });
        if (cancelled) return;

        if (!isValidPayload(response)) {
          throw new Error(
            response && typeof response === "object" && "message" in response && typeof response.message === "string"
              ? response.message
              : "Verified risk indices are temporarily unavailable.",
          );
        }

        hasData.current = true;
        setData(response.data);
        storeVerifiedPayload(response.data);
        setError(null);
        setStatus("ready");
      } catch (caught) {
        if (cancelled) return;

        const reported = reportError(
          "useRiskIndices",
          caught,
          "refreshing the verified public risk indices",
        );
        const cached = readCachedVerifiedPayload();
        if (cached) {
          hasData.current = true;
          setData(cached);
          setError({
            message: "Live refresh is temporarily unavailable. Showing the latest verified reading stored on this device.",
            retryable: true,
          });
          setStatus("ready");
          return;
        }

        setError(reported);
        setStatus(hasData.current ? "ready" : "error");
      }
    }

    void load();
    const timer = setInterval(() => void load(), refreshMs);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [loadPublicRiskIndices, refreshMs, reloadKey]);

  return useMemo(
    () => ({ data, status, error, retry }),
    [data, status, error, retry],
  );
}
