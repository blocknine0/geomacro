import { canonicalJson } from "./canonical-json.ts";
import { verifyDerivedStory } from "../../workers/control-plane/src/website-derived-intelligence.mjs";

// Issuer authenticity is separate from independent factual review and GRO.
// Reuse the existing free derived model; never loosen commercial admission.
export const FINDS_CATEGORIES = ["geopolitics", "macro", "rare_earth"] as const;
export const FINDS_DOMAIN = "geomacro.automated-finds.v1\n";
export const FINDS_MAX_AGE_MS = 2 * 60 * 60_000;
export const FINDS_B2_KEY = "geomacro-evidence/v1/automated-finds/latest.json.gz";
type Category = typeof FINDS_CATEGORIES[number];
export type AutomatedFindsPayload = {
  schema: "geomacro.automated-finds.v1";
  category: Category;
  generated_at: string;
  source_run_id: string;
  source_sha: string;
  source_verification: "publisher_native_release";
  independent_reviewed: false;
  scored: false;
  chargeable: false;
  delivery_scope: "free_website_only";
  original_release_delay_minutes: 0;
  retention_days: 30;
  healthy_feed_count: number;
  feed_count: number;
  signals: import("./stateless-intelligence-model").StatelessIntelligenceSignal[];
};
export type AutomatedFindsEnvelope = {
  payload: AutomatedFindsPayload;
  integrity: { signing_key_id: string; signature_scheme: "ed25519";
    canonicalization: "geomacro-canonical-json-v1"; payload_sha256: string; signature: string };
};
const exactKeys = (v: object, names: string[]) =>
  Object.keys(v).length === names.length && Object.keys(v).every(k => names.includes(k));
const payloadKeys = ["schema","category","generated_at","source_run_id","source_sha",
  "source_verification","independent_reviewed","scored","chargeable","delivery_scope",
  "original_release_delay_minutes","retention_days","healthy_feed_count","feed_count","signals"];

export function assertAutomatedFindsPayload(p: AutomatedFindsPayload, now = Date.now()): void {
  if (!p || !exactKeys(p, payloadKeys) || p.schema !== "geomacro.automated-finds.v1" ||
      !FINDS_CATEGORIES.includes(p.category) ||
      !/^\d{1,20}$/.test(p.source_run_id) || !/^[a-f0-9]{40}$/.test(p.source_sha) ||
      p.source_verification !== "publisher_native_release" || p.independent_reviewed !== false ||
      p.scored !== false || p.chargeable !== false || p.delivery_scope !== "free_website_only" ||
      (p.original_release_delay_minutes!==0&&p.original_release_delay_minutes!==15) || p.retention_days !== 30 ||
      !Number.isSafeInteger(p.feed_count) || p.feed_count < 1 || p.feed_count > 100 ||
      !Number.isSafeInteger(p.healthy_feed_count) || p.healthy_feed_count < 1 || p.healthy_feed_count > p.feed_count ||
      !Array.isArray(p.signals) || p.signals.length > 50 ||
      !Number.isFinite(now)) throw Error("AUTOMATED_FINDS_PAYLOAD_INVALID");
  const at = Date.parse(p.generated_at);
  if (!Number.isFinite(at) || new Date(at).toISOString() !== p.generated_at || at > now ||
      now - at > FINDS_MAX_AGE_MS ||
      p.signals.some(s => s.category !== p.category || !verifyDerivedStory(s, at) || !verifyDerivedStory(s, now)) ||
      new Set(p.signals.map(s => s.id)).size !== p.signals.length)
    throw Error("AUTOMATED_FINDS_CLOCK_OR_STORY_INVALID");
}

export function automatedFindsSignable(payload: AutomatedFindsPayload): string {
  return FINDS_DOMAIN + canonicalJson(payload);
}
type VerificationKeys = Record<string, string | { public_key_spki_b64: string;
  status?: string; not_before?: string | null; not_after?: string | null }>;
const unbase64 = (v: string) => Uint8Array.from(atob(v), c => c.charCodeAt(0));
export async function verifyAutomatedFindsEnvelope(
  e: AutomatedFindsEnvelope, keys: VerificationKeys, now = Date.now(),
): Promise<void> {
  if (!e || !exactKeys(e, ["payload","integrity"]) || !e.integrity ||
      !exactKeys(e.integrity,["signing_key_id","signature_scheme","canonicalization","payload_sha256","signature"]))
    throw Error("AUTOMATED_FINDS_ENVELOPE_INVALID");
  assertAutomatedFindsPayload(e.payload, now);
  const i=e.integrity;
  if (i.signature_scheme !== "ed25519" || i.canonicalization !== "geomacro-canonical-json-v1" ||
      !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(i.signing_key_id) ||
      !/^[a-f0-9]{64}$/.test(i.payload_sha256) || !/^[A-Za-z0-9+/]{86}==$/.test(i.signature))
    throw Error("AUTOMATED_FINDS_INTEGRITY_INVALID");
  if (!Object.prototype.hasOwnProperty.call(keys,i.signing_key_id)) throw Error("AUTOMATED_FINDS_UNKNOWN_KEY");
  const raw=keys[i.signing_key_id], key=typeof raw === "string" ? {public_key_spki_b64:raw} : raw;
  const at=Date.parse(e.payload.generated_at);
  if (!key || ![undefined,"active","retired"].includes(key.status) ||
      (key.not_before && (!Number.isFinite(Date.parse(key.not_before)) || at<Date.parse(key.not_before))) ||
      (key.not_after && (!Number.isFinite(Date.parse(key.not_after)) || at>Date.parse(key.not_after))))
    throw Error("AUTOMATED_FINDS_KEY_LIFECYCLE_INVALID");
  const bytes=new TextEncoder().encode(automatedFindsSignable(e.payload));
  const digest=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",bytes)),x=>x.toString(16).padStart(2,"0")).join("");
  const publicKey=await crypto.subtle.importKey("spki",unbase64(key.public_key_spki_b64),{name:"Ed25519"},false,["verify"]);
  if (digest!==i.payload_sha256 || !await crypto.subtle.verify("Ed25519",publicKey,unbase64(i.signature),bytes))
    throw Error("AUTOMATED_FINDS_SIGNATURE_INVALID");
}

export type AutomatedFindsSnapshot = { schema: "geomacro.automated-finds-snapshot.v1";
  batches: AutomatedFindsEnvelope[] };
export async function verifyAutomatedFindsSnapshot(s: AutomatedFindsSnapshot, keys: VerificationKeys, now=Date.now()) {
  if (!s || !exactKeys(s,["schema","batches"]) || s.schema!=="geomacro.automated-finds-snapshot.v1" ||
      !Array.isArray(s.batches) || s.batches.length!==3 ||
      new Set(s.batches.map(e=>e.payload?.category)).size!==3 || JSON.stringify(s).length>256_000)
    throw Error("AUTOMATED_FINDS_SNAPSHOT_INVALID");
  await Promise.all(s.batches.map(e=>verifyAutomatedFindsEnvelope(e,keys,now)));
  const first=s.batches[0].payload;
  if (s.batches.some(e=>e.payload.generated_at!==first.generated_at ||
      e.payload.source_run_id!==first.source_run_id || e.payload.source_sha!==first.source_sha))
    throw Error("AUTOMATED_FINDS_BATCH_BINDING_INVALID");
}
