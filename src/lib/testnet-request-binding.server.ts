import { createHash } from "node:crypto";

import {
  CommercialAccessError,
  type CommercialPrincipal,
} from "./commercial-access.server";
import { requireRiskSupabase } from "./risk-supabase.server";
import type { TestnetIntelligenceRequest } from "./testnet-intelligence-contract";

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, nested]) => [key, canonicalize(nested)]),
    );
  }
  return value;
}

export function testnetRequestFingerprint(request: TestnetIntelligenceRequest) {
  const { payment: _payment, ...billableRequest } = request;
  const canonical = JSON.stringify(canonicalize(billableRequest));
  return createHash("sha256").update(canonical).digest("hex");
}

function matchesBinding(
  row: Record<string, unknown>,
  request: TestnetIntelligenceRequest,
  fingerprint: string,
) {
  return (
    String(row.request_id ?? "") === request.request_id &&
    String(row.capability ?? "") === request.capability &&
    String(row.request_fingerprint_sha256 ?? "") === fingerprint
  );
}

function conflict(): never {
  throw new CommercialAccessError(
    409,
    "TESTNET_REQUEST_IDEMPOTENCY_CONFLICT",
    "This request_id is already bound to a different Testnet request payload. Use the original request exactly; do not send another payment.",
  );
}

export async function bindTestnetIntelligenceRequest(input: {
  principal: CommercialPrincipal;
  request: TestnetIntelligenceRequest;
}) {
  const db = requireRiskSupabase();
  const fingerprint = testnetRequestFingerprint(input.request);

  const lookup = async () => {
    const result = await db
      .from("testnet_api_request_bindings")
      .select("request_id,capability,request_fingerprint_sha256")
      .eq("principal_id", input.principal.principal_id)
      .eq("request_id", input.request.request_id)
      .maybeSingle();
    if (result.error) {
      throw new CommercialAccessError(
        503,
        "TESTNET_REQUEST_BINDING_UNAVAILABLE",
        "Testnet request binding is temporarily unavailable. Do not send a payment until this check succeeds.",
      );
    }
    return result.data as Record<string, unknown> | null;
  };

  const existing = await lookup();
  if (existing) {
    if (!matchesBinding(existing, input.request, fingerprint)) conflict();
    return {
      request_id: input.request.request_id,
      request_fingerprint_sha256: fingerprint,
      idempotent_replay: true,
    } as const;
  }

  const inserted = await db.from("testnet_api_request_bindings").insert({
    principal_id: input.principal.principal_id,
    request_id: input.request.request_id,
    capability: input.request.capability,
    request_fingerprint_sha256: fingerprint,
  });

  if (inserted.error) {
    // A concurrent identical request can win the unique insert. Re-read the
    // canonical row and accept only the exact same normalized payload.
    const raced = await lookup();
    if (!raced || !matchesBinding(raced, input.request, fingerprint)) conflict();
    return {
      request_id: input.request.request_id,
      request_fingerprint_sha256: fingerprint,
      idempotent_replay: true,
    } as const;
  }

  return {
    request_id: input.request.request_id,
    request_fingerprint_sha256: fingerprint,
    idempotent_replay: false,
  } as const;
}
