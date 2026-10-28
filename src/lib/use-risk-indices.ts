import { withPublicRuntimeTimeout } from "./public-runtime-timeout";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PublicRiskIndices } from "./risk-indices.types";
import {ageVerifiedRiskIndices,verifiedRiskIndicesShape} from "./risk-indices-public-validation";
import { reportError, type UserError } from "./user-errors";
import {getWebsiteLaggedGlobalRisk} from "./website-lagged-global-risk.functions";
import {riskIndicesFromGlobalRisk} from "./risk-indices-from-global-risk";
import {websitePublicCutoff} from "./website-publication-delay";

export type RiskIndicesStatus = "loading" | "ready" | "updating" | "error";

type AppRiskIndicesResponse =
  | {
      ok: true;
      data: PublicRiskIndices;
      meta?: { authority?: string; snapshot_as_of?: string };
    }
  | { ok: false; code?: string; message?: string };

type EdgeRiskIndicesResponse = {
  schema?: string;
  source_project?: string;
  generated_at?: string;
  data?: PublicRiskIndices;
};

type RiskIndicesReadTarget =
  | { kind: "edge"; url: string }
  | { kind: "app"; url: string };

const REQUEST_TIMEOUT_MS = 8_000;
const EDGE_AUTHORITY = "backblaze-b2-risk-indices-edge";
const EDGE_SCHEMA = "geomacro.public-risk-indices-live.v1";
const EDGE_PROJECT = "ldpwajisioljyjtojvfx";
const METHODOLOGY = "gri-v1.2.0";
export const RISK_INDICES_EDGE_URL =
  "https://geomacro-risk-indices.daspallab202391.workers.dev/risk-indices";
const RISK_INDICES_APP_URL = "/api/public/risk-indices";

const READ_TARGETS: RiskIndicesReadTarget[] = [
  { kind: "edge", url: RISK_INDICES_EDGE_URL },
  { kind: "app", url: RISK_INDICES_APP_URL },
];


async function readVerifiedRiskIndices(target: RiskIndicesReadTarget): Promise<PublicRiskIndices> {
  const response = await fetch(target.url, {
    method: "GET",
    headers: { Accept: "application/json" },
    cache: "no-store",
    credentials: target.kind === "app" ? "same-origin" : "omit",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`Risk Indices ${target.kind} read failed with HTTP ${response.status}`);
  }

  let data: PublicRiskIndices | undefined;
  if (target.kind === "edge") {
    if (response.headers.get("x-geomacro-authority") !== EDGE_AUTHORITY) {
      throw new Error("Risk Indices edge authority header is missing or invalid");
    }
    const body = (await response.json()) as EdgeRiskIndicesResponse;
    if (body.schema !== EDGE_SCHEMA || body.source_project !== EDGE_PROJECT) {
      throw new Error("Risk Indices edge envelope is invalid");
    }
    data = body.data;
  } else {
    const body = (await response.json()) as AppRiskIndicesResponse;
    if (!body.ok) throw new Error(body.message ?? "Risk Indices app API returned an invalid package");
    if (body.meta?.authority !== EDGE_AUTHORITY) {
      throw new Error("Risk Indices app API authority is missing or invalid");
    }
    data = body.data;
  }

  if (!verifiedRiskIndicesShape(data)) throw new Error("Risk Indices verified contract validation failed");
  return data;
}

async function readWithFailover(): Promise<PublicRiskIndices> {
  let lastError: unknown = new Error("Risk Indices read targets are unavailable");
  for (const target of READ_TARGETS) {
    try {
      return await readVerifiedRiskIndices(target);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
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
        let response:PublicRiskIndices;
        try{
          const lagged=await withPublicRuntimeTimeout(getWebsiteLaggedGlobalRisk({data:{}}),10_000,"WEBSITE_RISK_INDICES_LAGGED_READ_TIMEOUT");
          response=riskIndicesFromGlobalRisk(lagged.data);
          if(!verifiedRiskIndicesShape(response))throw new Error("WEBSITE_LAGGED_RISK_INDICES_INVALID");
        }catch{
          // Distinct read-only edge fallback may serve only an already
          // one-hour-old independently verified index snapshot. Never
          // replace a true archived snapshot with a fresh live index score.
          const edge=await readWithFailover();
          const snapshotAt=Date.parse(edge.snapshotAsOf);
          if(!Number.isFinite(snapshotAt)||snapshotAt>websitePublicCutoff()||
            edge.indices.some(x=>x.readingAsOf&&Date.parse(x.readingAsOf)>websitePublicCutoff()))
            throw new Error("WEBSITE_RISK_INDICES_60MIN_PROOF_HOLD");
          response={...edge,indices:edge.indices.map(x=>({...x,topEvent:null}))};
        }
        if (cancelled) return;

        hasData.current = true;
        setData(ageVerifiedRiskIndices(response));
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
        // A once-current cached signed reading must age even when every
        // independent edge is down; never keep a frozen LIVE label forever.
        setData((prior)=>prior?ageVerifiedRiskIndices(prior):null);
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
