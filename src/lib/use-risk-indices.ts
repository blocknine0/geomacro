import { withPublicRuntimeTimeout } from "./public-runtime-timeout";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  PUBLIC_RISK_INDICES_CONTRACT_VERSION,
  type PublicRiskIndices,
} from "./risk-indices.types";
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
export const GEOMACRO_CERTIFIED_NEWS_GRI_URL =
  "https://geomacro-control-plane.daspallab202391.workers.dev/v1/public/geomacro-certified-news-severity-gri";
const RISK_INDICES_APP_URL = "/api/public/risk-indices";

const READ_TARGETS: RiskIndicesReadTarget[] = [
  { kind: "edge", url: RISK_INDICES_EDGE_URL },
  { kind: "app", url: RISK_INDICES_APP_URL },
];

function validIndices(data: PublicRiskIndices | null | undefined): data is PublicRiskIndices {
  if (
    !data ||
    data.contractVersion !== PUBLIC_RISK_INDICES_CONTRACT_VERSION ||
    data.parentMethodologyVersion !== METHODOLOGY ||
    data.verificationStatus !== "verified" ||
    !Array.isArray(data.indices) ||
    data.indices.length !== 3
  ) return false;

  const expected = new Set(["geopolitics", "macro", "critical_minerals"]);
  for (const index of data.indices) {
    if (!expected.delete(index.key)) return false;
    if (
      index.status !== "available" ||
      !Number.isFinite(Number(index.score)) ||
      !Array.isArray(index.series?.["7D"]?.buckets) ||
      index.series["7D"].buckets.length < 2 ||
      !Array.isArray(index.series?.["30D"]?.buckets) ||
      index.series["30D"].buckets.length < index.series["7D"].buckets.length
    ) return false;
  }
  return expected.size === 0;
}

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

  if (!validIndices(data)) throw new Error("Risk Indices verified contract validation failed");
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


/**
 * Dedicated GeoMacro-issued (NOT independently reviewed) news severity GRI.
 * Browser relies on the pinned GeoMacro HTTPS authority and checks the exact
 * public payload hash, issuer metadata and self-certification scope.
 * The HMAC signature itself is verifiable only by the issuer holding its key.
 */
export async function readGeoMacroCertifiedNewsRisk(): Promise<PublicRiskIndices> {
  const response = await fetch(GEOMACRO_CERTIFIED_NEWS_GRI_URL, {
    method:"GET",redirect:"error",cache:"no-store",credentials:"omit",
    headers:{Accept:"application/json"},
    signal:AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if(!response.ok||response.redirected ||
     response.headers.get("x-geomacro-certification")!=="geomacro-self-certified-news-severity-v1"||
     response.headers.get("x-geomacro-methodology")!=="geomacro-news-severity-v1.1.0")
    throw Error("GEOMACRO_NEWS_GRI_AUTHORITY_UNAVAILABLE");
  const doc=await response.json() as {
    schema?:string;issuer?:string;scope?:string;independent_third_party_certified?:boolean;
    generated_at?:string;data?:PublicRiskIndices;
    certification?:{issuer?:string;scheme?:string;signed_payload_sha256?:string;
      signature_hex?:string;independent_external_audit?:boolean};
  };
  const cert=doc.certification;
  const indices=doc.data?.indices;
  const stamp=Date.parse(doc.generated_at??"");
  if(doc.schema!=="geomacro.self-certified-news-severity-gri.v1"||
     doc.issuer!=="GeoMacro"||
     doc.scope!=="GEOMACRO_SELF_CERTIFIED_NEWS_SEVERITY_CALCULATION_ONLY"||
     doc.independent_third_party_certified!==false||
     cert?.issuer!=="GeoMacro"||cert.scheme!=="HMAC-SHA256"||
     cert.independent_external_audit!==false||
     !/^[a-f0-9]{64}$/u.test(cert.signature_hex??"")||
     !/^[a-f0-9]{64}$/u.test(cert.signed_payload_sha256??"")||
     !Number.isFinite(stamp)||stamp>Date.now()+60_000||Date.now()-stamp>5*60_000||
     doc.data?.snapshotAsOf!==doc.generated_at||
     doc.data?.parentMethodologyVersion!=="geomacro-news-severity-v1.1.0"||
     doc.data.proofScope!=="geomacro-news-severity"||
     doc.data.verificationStatus!=="verified"||
     doc.data.contractVersion!==PUBLIC_RISK_INDICES_CONTRACT_VERSION||
     !Array.isArray(indices)||indices.length!==3)
   throw Error("GEOMACRO_NEWS_GRI_CERTIFICATION_INVALID");
  const domain=new Set(["geopolitics","macro","critical_minerals"]);
  for(const index of indices){
    if(!domain.delete(index.key)||!["available","unavailable"].includes(index.status)||
       (index.status==="available"&&(
        typeof index.score!=="number"||!Number.isFinite(index.score)||
        index.score<0||index.score>100||
        !index.readingAsOf||!Number.isFinite(Date.parse(index.readingAsOf))))||
       (index.status==="unavailable"&&index.score!==null)||
     !index.sourceMix||
     index.sourceMix.osint_event_facts_verified!==false||
     !Number.isSafeInteger(index.sourceMix.public_news)||
     !Number.isSafeInteger(index.sourceMix.osint)||
     index.sourceMix.public_news<0||index.sourceMix.osint<0||
     index.sourceMix.public_news+index.sourceMix.osint!==index.eventCount||
     index.independentStoryCount!==index.sourceMix.public_news)
      throw Error("GEOMACRO_NEWS_GRI_INDEX_INVALID");
  }
  if(domain.size!==0)throw Error("GEOMACRO_NEWS_GRI_CATEGORY_MISSING");
  const {certification:_,...signed}=doc;
  const signedBytes=new TextEncoder().encode(JSON.stringify(signed));
  const digest=new Uint8Array(await crypto.subtle.digest("SHA-256",signedBytes));
  const hash=Array.from(digest,b=>b.toString(16).padStart(2,"0")).join("");
  if(hash!==cert.signed_payload_sha256)
    throw Error("GEOMACRO_NEWS_GRI_SIGNED_PAYLOAD_MISMATCH");
  return doc.data;
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
        const response=await readGeoMacroCertifiedNewsRisk();
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
