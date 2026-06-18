import type { CyclePayload } from "./autonomous-agent.functions";

export type Attestation = {
  cycleId: string;
  digest: string; // 0x-prefixed sha256 of canonical payload
  txHash: string;
  payload: CyclePayload;
  attestedAt: string;
};

const KEY = (addr: string) => `geomacro.attestations.${addr.toLowerCase()}`;

export function loadAttestations(address: string | null): Attestation[] {
  if (!address || typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY(address));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Attestation[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveAttestation(address: string, a: Attestation) {
  const list = loadAttestations(address);
  list.unshift(a);
  // keep last 50
  localStorage.setItem(KEY(address), JSON.stringify(list.slice(0, 50)));
}

/** Compact past attestations into the smallest useful prompt context. */
export function compactPastForPrompt(list: Attestation[], n = 6) {
  return list.slice(0, n).map((a) => ({
    cycleId: a.cycleId,
    topic: a.payload.topic,
    prediction: a.payload.prediction.statement,
    side: a.payload.prediction.side,
    confidence: a.payload.prediction.confidence,
    expectedOutcome: a.payload.prediction.expectedOutcome,
    attestedAt: a.attestedAt,
  }));
}

/** Browser SHA-256 → 0x hex string. */
export async function sha256Hex(input: string): Promise<string> {
  const buf = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", buf);
  const arr = Array.from(new Uint8Array(digest));
  return "0x" + arr.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Encode the digest + cycleId into calldata for the attestation tx. */
export function encodeAttestationCalldata(digest: string, cycleId: string): string {
  const tag = "0x" + Array.from(new TextEncoder().encode(`geo.v1:${cycleId}:`))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return tag + digest.replace(/^0x/, "");
}