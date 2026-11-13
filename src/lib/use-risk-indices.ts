import { withPublicRuntimeTimeout } from "./public-runtime-timeout";
import {
  RISK_INDICES_REQUEST_TIMEOUT_MS,
  RISK_INDICES_VERIFIED_CACHE_MS,
  RISK_INDICES_VISIBLE_REFRESH_MS,
  riskIndicesRefreshDelay,
  riskIndicesResumeDelay,
  riskIndicesSignedSourceRemainingMs,
} from "./risk-indices-browser-cadence";
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

const REQUEST_TIMEOUT_MS = RISK_INDICES_REQUEST_TIMEOUT_MS;
const VERIFIED_READ_CACHE_MS = RISK_INDICES_VERIFIED_CACHE_MS;
const REVIEWED_SIGNED_RISK_INDICES_APP_URL="/api/public/reviewed-risk-indices";
function canonicalPublicJson(value:unknown):string{
 if(value===null||typeof value!=="object")return JSON.stringify(value);
 if(Array.isArray(value))return "["+value.map(canonicalPublicJson).join(",")+"]";
 return "{"+Object.keys(value as Record<string,unknown>).sort().map(key=>
  JSON.stringify(key)+":"+canonicalPublicJson((value as Record<string,unknown>)[key])).join(",")+"}";
}
type SignedReviewedIndicesResponse={
  ok:boolean;data?:PublicRiskIndices;
  meta?:{authority?:string;signature_verified?:boolean;signature_scheme?:string;
    public_key_trust?:string;source_as_of?:string};
};
async function readCurrentReviewedSignedIndices():Promise<PublicRiskIndices>{
  const res=await fetch(REVIEWED_SIGNED_RISK_INDICES_APP_URL,{
    method:"GET",redirect:"error",cache:"no-store",credentials:"same-origin",
    headers:{"Accept":"application/json"},signal:AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  });
  if(res.status!==200||res.redirected)
    throw Error("CURRENT_REVIEWED_SIGNED_GRI_UNAVAILABLE");
  const body=await res.json() as SignedReviewedIndicesResponse;
  if(body.ok!==true||body.meta?.authority!=="geomacro-reviewed-gri-ed25519-delivery"||
     body.meta.signature_verified!==true||body.meta.signature_scheme!=="Ed25519"||
     !validIndices(body.data))
     throw Error("REVIEWED_GRI_CRYPTOGRAPHIC_ACCEPTANCE_INVALID");
  const now=Date.now();
  const snapshot=Date.parse(body.data.snapshotAsOf);
  if(!Number.isFinite(snapshot)||snapshot>now+5*60000||now-snapshot>60*60000||
     body.meta.source_as_of!==body.data.snapshotAsOf||
     body.data.proofScope!=="verified-category-projection"||
     body.data.indices.some(index=>
       index.readingStatus!=="current"||
       !Number.isFinite(Date.parse(index.readingAsOf??""))||
       now-Date.parse(index.readingAsOf??"")>60*60000||
       Date.parse(index.readingAsOf??"")>now+5*60000))
    throw Error("REVIEWED_GRI_CURRENT_NATIVE_CLOCK_REQUIRED");
  return body.data;
}

let lastCertifiedRead: { loadedAt: number; data: PublicRiskIndices } | null = null;
// One in-flight read per browser JS context even when both Risk Indices and
// Intelligence panels mount concurrently. No failure response is cached.
let inFlightCertifiedRead: Promise<PublicRiskIndices> | null = null;

/** Cache a validated reviewed index or the distinct self-certified 72h proxy. */
async function readCachedCertifiedNewsRisk(forceRefresh: boolean): Promise<PublicRiskIndices> {
  if (!forceRefresh && lastCertifiedRead &&
      Date.now() - lastCertifiedRead.loadedAt < VERIFIED_READ_CACHE_MS &&
      Date.now()-Date.parse(lastCertifiedRead.data.snapshotAsOf)<=60*60000 &&
      lastCertifiedRead.data.indices.every(index=>index.readingAsOf &&
        Date.now()-Date.parse(index.readingAsOf)<=60*60000)) {
    return lastCertifiedRead.data;
  }
  if (inFlightCertifiedRead) return inFlightCertifiedRead;
  // The live view consumes the shared self-certified journal projection first.
  // Genuine reviewed GRI remains an unchanged, separate fallback with its own
  // reviewer and 7D/30D acceptance requirements.
  const pending = (async()=>{
   try{return await readGeoMacroCertifiedNewsRisk()}
   catch{return await readCurrentReviewedSignedIndices()}
  })().then(data => {
    lastCertifiedRead = { loadedAt: Date.now(), data };
    return data;
  });
  inFlightCertifiedRead = pending;
  try {
    return await pending;
  } finally {
    if (inFlightCertifiedRead === pending) inFlightCertifiedRead = null;
  }
}
const EDGE_AUTHORITY = "backblaze-b2-risk-indices-edge";
const EDGE_SCHEMA = "geomacro.public-risk-indices-live.v1";
const EDGE_PROJECT = "ldpwajisioljyjtojvfx";
const METHODOLOGY = "gri-v1.2.0";
export const RISK_INDICES_EDGE_URL =
  "https://geomacro-risk-indices.daspallab202391.workers.dev/risk-indices";
export const GEOMACRO_CERTIFIED_NEWS_GRI_URL =
  "https://geomacro-control-plane.daspallab202391.workers.dev/v1/public/geomacro-news-severity-risk-indices";
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
 * Browser verifies GeoMacro's Ed25519 delivery signature and preserves the
 * separate self-certified 72h methodology scope.
 */
export async function readGeoMacroCertifiedNewsRisk(): Promise<PublicRiskIndices> {
  const [response,keyResponse] = await Promise.all([fetch(GEOMACRO_CERTIFIED_NEWS_GRI_URL, {
    method:"GET",redirect:"error",cache:"default",credentials:"omit",
    headers:{Accept:"application/json"},
    signal:AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  }),fetch("https://geomacro-control-plane.daspallab202391.workers.dev/v1/public/risk-gate-decision-key",{
    method:"GET",redirect:"error",cache:"default",credentials:"omit",
    headers:{Accept:"application/json"},signal:AbortSignal.timeout(REQUEST_TIMEOUT_MS)})]);
  if(!response.ok||response.redirected ||
     response.headers.get("x-geomacro-certification")!=="geomacro-self-certified-news-severity-v1"||
     response.headers.get("x-geomacro-methodology")!=="geomacro-news-severity-v1.1.0")
    throw Error("GEOMACRO_NEWS_GRI_AUTHORITY_UNAVAILABLE");
  const doc=await response.json() as {
    schema?:string;issuer?:string;scope?:string;independent_third_party_certified?:boolean;
    generated_at?:string;data?:PublicRiskIndices & {source_snapshot?:{checked_at?:string;payload_sha256?:string}};
    ed25519_delivery?:{schema?:string;signature_scheme?:string;signature_key_id?:string;
      signature_b64?:string;payload_sha256?:string;proof_scope?:string;
      independent_third_party_certified?:boolean;source_event_facts_independently_verified?:boolean;
      source_checked_at?:string;source_payload_sha256?:string};
  };
  const delivery=doc.ed25519_delivery;
  const indices=doc.data?.indices;
  const stamp=Date.parse(doc.generated_at??"");
  if(doc.schema!=="geomacro.self-certified-news-severity-gri.v1"||
     doc.issuer!=="GeoMacro"||
     doc.scope!=="GEOMACRO_SELF_CERTIFIED_NEWS_SEVERITY_CALCULATION_ONLY"||
     doc.independent_third_party_certified!==false||
     !Number.isFinite(stamp)||stamp>Date.now()+60_000||Date.now()-stamp>5*60_000||
     doc.data?.snapshotAsOf!==doc.generated_at||
     doc.data?.parentMethodologyVersion!=="geomacro-news-severity-v1.1.0"||
     doc.data.proofScope!=="geomacro-news-severity"||
     doc.data.verificationStatus!=="verified"||
     doc.data.contractVersion!==PUBLIC_RISK_INDICES_CONTRACT_VERSION||
     !Array.isArray(indices)||indices.length!==3||
     !keyResponse.ok||keyResponse.redirected)
   throw Error("GEOMACRO_NEWS_GRI_CERTIFICATION_INVALID");
  const keyInfo=await keyResponse.json() as {ok?:boolean;scheme?:string;key_id?:string;public_key_spki_b64?:string};
  const signedReport={...doc};delete signedReport.ed25519_delivery;
  const canonical=canonicalPublicJson(signedReport);
  const bytes=new TextEncoder().encode(canonical);
  const hashBytes=new Uint8Array(await crypto.subtle.digest("SHA-256",bytes));
  const payloadHash=Array.from(hashBytes,b=>b.toString(16).padStart(2,"0")).join("");
  if(delivery?.schema!=="geomacro.news-severity-ed25519-delivery.v1"||
     delivery.signature_scheme!=="Ed25519"||
     delivery.proof_scope!=="GEOMACRO_SELF_CERTIFIED_NEWS_SEVERITY_CALCULATION_ONLY"||
     delivery.independent_third_party_certified!==false||
     delivery.source_event_facts_independently_verified!==false||
     !Number.isFinite(Date.parse(delivery.source_checked_at??""))||
     !/^[a-f0-9]{64}$/u.test(delivery.source_payload_sha256??"")||
     doc.data?.source_snapshot?.checked_at!==delivery.source_checked_at||
     doc.data?.source_snapshot?.payload_sha256!==delivery.source_payload_sha256||
     keyInfo.ok!==true||keyInfo.scheme!=="Ed25519"||
     keyInfo.key_id!==delivery.signature_key_id||
     response.headers.get("x-geomacro-signature")!==delivery.signature_b64||
     response.headers.get("x-geomacro-signing-key-id")!==delivery.signature_key_id||
     response.headers.get("x-geomacro-payload-sha256")!==delivery.payload_sha256||
     payloadHash!==delivery.payload_sha256||typeof keyInfo.public_key_spki_b64!=="string"||
     !/^[A-Za-z0-9+/]{55,120}={0,2}$/u.test(keyInfo.public_key_spki_b64))
    throw Error("GEOMACRO_NEWS_GRI_ED25519_ENVELOPE_INVALID");
  const key=await crypto.subtle.importKey("spki",Uint8Array.from(atob(keyInfo.public_key_spki_b64),x=>x.charCodeAt(0)),
    {name:"Ed25519"},false,["verify"]);
  const signature=Uint8Array.from(atob(delivery.signature_b64),x=>x.charCodeAt(0));
  if(key.algorithm.name!=="Ed25519"||signature.length!==64||
     !await crypto.subtle.verify("Ed25519",key,signature,bytes))
    throw Error("GEOMACRO_NEWS_GRI_ED25519_SIGNATURE_INVALID");
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
     index.independentStoryCount!==0)
      throw Error("GEOMACRO_NEWS_GRI_INDEX_INVALID");
  }
  if(domain.size!==0)throw Error("GEOMACRO_NEWS_GRI_CATEGORY_MISSING");
  // Only canonical 72-hour source-native series are accepted. The 7D/30D
  // legacy fields are not used as substitutes for news-severity history.
  for (const index of indices) {
    for (const window of ["24H", "48H", "72H"] as const) {
      const series=index.observedSeverity?.[window];
      if(!series||series.timeframe!==window)throw Error("GEOMACRO_NEWS_GRI_HISTORY_UNAVAILABLE");
      const buckets=series.buckets;
      if(buckets===null){
        if(series.low!==null||series.high!==null)throw Error("GEOMACRO_NEWS_GRI_EMPTY_HISTORY_INVALID");
        continue;
      }
      if(!Array.isArray(buckets)||buckets.length===0||buckets.length>13||
        typeof series.low!=="number"||typeof series.high!=="number"||
        !Number.isFinite(series.low)||!Number.isFinite(series.high))
        throw Error("GEOMACRO_NEWS_GRI_HISTORY_INVALID");
      let previous=-Infinity;
      const start=stamp-Number.parseInt(window,10)*3600000;
      for (const bucket of buckets) {
        if(!Number.isSafeInteger(bucket.t)||bucket.t<=previous||
          bucket.t>stamp||bucket.t+6*3600000<=start||
          bucket.t%(6*3600000)!==0||
          !Number.isFinite(bucket.avg)||bucket.avg<0||bucket.avg>100||
          !Number.isSafeInteger(bucket.count)||bucket.count<1)
          throw Error("GEOMACRO_NEWS_GRI_HISTORY_BUCKET_INVALID");
        previous=bucket.t;
      }
      if(Math.abs(series.low-Math.min(...buckets.map(b=>b.avg)))>1e-9||
        Math.abs(series.high-Math.max(...buckets.map(b=>b.avg)))>1e-9)
        throw Error("GEOMACRO_NEWS_GRI_HISTORY_RANGE_INVALID");
    }
  }

  return doc.data;
}

export function useRiskIndices(refreshMs = RISK_INDICES_VISIBLE_REFRESH_MS) {
  const [data, setData] = useState<PublicRiskIndices | null>(null);
  const [status, setStatus] = useState<RiskIndicesStatus>("loading");
  const [error, setError] = useState<UserError | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const hasData = useRef(false);
  const lastCurrent = useRef<PublicRiskIndices|null>(null);

  const retry = useCallback(() => setReloadKey((value) => value + 1), []);

  useEffect(() => {
    let cancelled = false;
    let inFlight = false;
    let scheduled: number | undefined;
    let lastStartedAt = 0;
    let nextCadenceMs = riskIndicesRefreshDelay(false, refreshMs);

    function stopTimer() {
      if (scheduled !== undefined) {
        window.clearTimeout(scheduled);
        scheduled = undefined;
      }
    }
    function remainingSignedValidityMs(): number | null {
      const previous = lastCurrent.current;
      if (!previous) return null;
      return riskIndicesSignedSourceRemainingMs(
        previous.snapshotAsOf,
        previous.indices.map(index => index.readingAsOf),
      );
    }
    function revokeExpiredCurrent(): boolean {
      if (remainingSignedValidityMs() !== 0) return false;
      // Fail closed immediately on real source expiry, not up to one browser
      // polling period later. This never substitutes a historical score.
      lastCurrent.current = null;
      hasData.current = false;
      setData(null);
      setStatus("error");
      return true;
    }
    function scheduleNext(delayMs: number) {
      stopTimer();
      if (cancelled || document.visibilityState === "hidden") return;
      const sourceRemaining = remainingSignedValidityMs();
      const boundedDelay = sourceRemaining === null
        ? delayMs
        : Math.min(delayMs, sourceRemaining);
      scheduled = window.setTimeout(() => {
        scheduled = undefined;
        revokeExpiredCurrent();
        void load(true);
      }, boundedDelay);
    }
    async function load(forceRefresh = false) {
      if (cancelled || inFlight || document.visibilityState === "hidden") return;
      stopTimer();
      inFlight = true;
      lastStartedAt = Date.now();
      setStatus(hasData.current ? "updating" : "loading");
      try {
        // Exactly ONE bounded read per attempt. A missing signed GRI (HTTP
        // 503) does not justify the previous 350/900ms triple-read burst.
        const response = await readCachedCertifiedNewsRisk(forceRefresh);
        if (cancelled) return;
        hasData.current = true;
        lastCurrent.current = response;
        setData(response);
        setError(null);
        setStatus("ready");
        nextCadenceMs = riskIndicesRefreshDelay(true, refreshMs);
      } catch (caught) {
        if (cancelled) return;
        const userError = reportError(
          "useRiskIndices",
          caught,
          "refreshing the verified public risk indices",
        );
        setError(userError);
        // Never present a previous verified score as CURRENT once its real
        // source-native 60-minute certification window is exhausted.
        const previous = lastCurrent.current;
        const previousIsCurrent = previous !== null &&
          Number.isFinite(Date.parse(previous.snapshotAsOf)) &&
          Date.now()-Date.parse(previous.snapshotAsOf)<=60*60000 &&
          previous.indices.every(index => index.readingAsOf &&
            Number.isFinite(Date.parse(index.readingAsOf)) &&
            Date.now()-Date.parse(index.readingAsOf)<=60*60000);
        if (!previousIsCurrent) {
          hasData.current = false;
          lastCurrent.current = null;
          setData(null);
        }
        setStatus(previousIsCurrent ? "ready" : "error");
        nextCadenceMs = riskIndicesRefreshDelay(false, refreshMs);
      } finally {
        inFlight = false;
        if (!cancelled && !document.hidden) {
          scheduleNext(riskIndicesResumeDelay(lastStartedAt, Date.now(), nextCadenceMs));
        }
      }
    }

    function resumeVisibleBrowser() {
      if (cancelled) return;
      if (document.visibilityState === "hidden") {
        stopTimer();
        return;
      }
      if (inFlight) return;
      const justExpired = revokeExpiredCurrent();
      const remaining = riskIndicesResumeDelay(lastStartedAt, Date.now(), nextCadenceMs);
      if (justExpired || remaining === 0) {
        stopTimer();
        void load(true);
      } else {
        scheduleNext(remaining);
      }
    }

    document.addEventListener("visibilitychange", resumeVisibleBrowser);
    window.addEventListener("focus", resumeVisibleBrowser);
    // First visible page mount is immediate; subsequent timer ticks are
    // completion-aware and cannot overlap slow 8-second network reads.
    if (document.visibilityState !== "hidden") void load(reloadKey > 0);
    return () => {
      cancelled = true;
      stopTimer();
      document.removeEventListener("visibilitychange", resumeVisibleBrowser);
      window.removeEventListener("focus", resumeVisibleBrowser);
    };
  }, [refreshMs, reloadKey]);

  return useMemo(
    () => ({ data, status, error, retry }),
    [data, status, error, retry],
  );
}
