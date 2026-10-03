/**
 * Canonical public read model for the Global Risk Index workspace.
 *
 * Global Risk has its own serving failure domain. The browser reads the
 * proof-validated Cloudflare/B2 edge first; the Lovable same-origin API is only
 * a compatibility fallback. Intelligence, Ask Geomacro, or website API changes
 * cannot become the primary dependency for this workspace. Every accepted
 * package is revalidated client-side for methodology, proof fields, combined
 * history and all persisted domain histories. A refresh failure never destroys
 * an already verified reading and never creates a synthetic replacement.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { validateGlobalRiskContinuity } from "@/lib/global-risk-continuity";
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

type AppGlobalRiskResponse =
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

type EdgeGlobalRiskResponse = {
  schema?: string;
  source_project?: string;
  generated_at?: string;
  data?: GlobalRisk;
};

type RiskReadTarget =
  | { kind: "edge"; url: string }
  | { kind: "app"; url: string };

const REQUEST_TIMEOUT_MS = 8_000;
const EDGE_AUTHORITY = "backblaze-b2-verified-edge";
const EDGE_SCHEMA = "geomacro.public-global-risk-live.v1";
const EDGE_PROJECT = "ldpwajisioljyjtojvfx";
export const GLOBAL_RISK_EDGE_URL =
  "https://geomacro-global-risk.daspallab202391.workers.dev/global-risk";
const GLOBAL_RISK_APP_URL = "/api/public/global-risk";

const READ_TARGETS: RiskReadTarget[] = [
  { kind: "edge", url: GLOBAL_RISK_EDGE_URL },
  { kind: "app", url: GLOBAL_RISK_APP_URL },
];

async function readVerifiedRisk(target: RiskReadTarget): Promise<GlobalRisk> {
  const response = await fetch(target.url, {
    method: "GET",
    headers: { Accept: "application/json" },
    cache: "no-store",
    credentials: target.kind === "app" ? "same-origin" : "omit",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`Global Risk ${target.kind} read failed with HTTP ${response.status}`);
  }

  let next: GlobalRisk | undefined;
  if (target.kind === "edge") {
    if (response.headers.get("x-geomacro-authority") !== EDGE_AUTHORITY) {
      throw new Error("Global Risk edge authority header is missing or invalid");
    }
    const body = (await response.json()) as EdgeGlobalRiskResponse;
    if (body.schema !== EDGE_SCHEMA || body.source_project !== EDGE_PROJECT) {
      throw new Error("Global Risk edge envelope is invalid");
    }
    next = body.data;
  } else {
    const body = (await response.json()) as AppGlobalRiskResponse;
    if (!body.ok) {
      throw new Error(body.message || "Global Risk app API returned an invalid package");
    }
    if (body.meta?.authority !== EDGE_AUTHORITY) {
      throw new Error("Global Risk app API authority is missing or invalid");
    }
    next = body.data;
  }

  if (!next) throw new Error("Global Risk package is missing data");
  const continuity = validateGlobalRiskContinuity(next);
  if (!continuity.ok) {
    throw new Error(`Global Risk continuity rejected: ${continuity.code}`);
  }
  return next;
}

async function readWithFailover(): Promise<GlobalRisk> {
  let lastError: unknown = new Error("Global Risk read targets are unavailable");
  for (const target of READ_TARGETS) {
    try {
      return await readVerifiedRisk(target);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

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
        const next = await readWithFailover();
        if (cancelled) return;

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
