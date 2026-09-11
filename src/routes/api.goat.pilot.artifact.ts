import { createHash } from "node:crypto";
import { createFileRoute } from "@tanstack/react-router";

import { requireGoatPilotAccess } from "../lib/goat-pilot-auth.server";
import { requireRiskSupabase } from "../lib/risk-supabase.server";
import { verifyPublicRiskObjectArtifact } from "../lib/risk-object-verification.server";

const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;
const CLIENT_REQUEST_ID_RE = /^[A-Za-z0-9._:-]{1,256}$/;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

function externalAgentId(payerAddress: string) {
  const normalized = payerAddress.trim().toLowerCase();
  const digest = createHash("sha256").update(normalized, "utf8").digest("hex");
  return `goat:sha256:${digest}`;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function containsForbiddenPublicSourceKeys(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.some(containsForbiddenPublicSourceKeys);
  }
  const record = asRecord(value);
  if (!record) return false;

  for (const [key, child] of Object.entries(record)) {
    if (/^(source_url|source_name|publisher|publisher_name|raw_payload|raw_content)$/i.test(key)) {
      return true;
    }
    if (containsForbiddenPublicSourceKeys(child)) return true;
  }
  return false;
}

async function handlePost(request: Request) {
  try {
    requireGoatPilotAccess(request);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    return jsonResponse(
      {
        ok: false,
        error: message === "GOAT_PILOT_ACCESS_NOT_CONFIGURED"
          ? "GOAT_PILOT_ACCESS_NOT_CONFIGURED"
          : "GOAT_PILOT_ACCESS_DENIED",
        execution_authorized: false,
      },
      message === "GOAT_PILOT_ACCESS_NOT_CONFIGURED" ? 503 : 401,
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ ok: false, error: "INVALID_JSON", execution_authorized: false }, 400);
  }

  const record = asRecord(body);
  const clientRequestId = typeof record?.client_request_id === "string"
    ? record.client_request_id.trim()
    : "";
  const payerAddress = typeof record?.payer_address === "string"
    ? record.payer_address.trim().toLowerCase()
    : "";

  if (!CLIENT_REQUEST_ID_RE.test(clientRequestId) || !ADDRESS_RE.test(payerAddress)) {
    return jsonResponse({ ok: false, error: "INVALID_REQUEST", execution_authorized: false }, 400);
  }

  const db = requireRiskSupabase();
  const agentId = externalAgentId(payerAddress);

  const { data: pilot, error: pilotError } = await db
    .from("agent_goat_pilot_requests")
    .select("request_id,idempotency_key,payer_address,environment")
    .eq("external_agent_id", agentId)
    .eq("idempotency_key", clientRequestId)
    .maybeSingle();

  if (pilotError) {
    return jsonResponse({ ok: false, error: "GOAT_PILOT_LEDGER_UNAVAILABLE", execution_authorized: false }, 503);
  }
  if (!pilot || String(pilot.payer_address).toLowerCase() !== payerAddress) {
    return jsonResponse({ ok: false, error: "GOAT_PILOT_REQUEST_NOT_FOUND", execution_authorized: false }, 404);
  }

  const [{ data: fulfillment, error: fulfillmentError }, { data: resource, error: resourceError }] = await Promise.all([
    db
      .from("agent_goat_pilot_fulfillments")
      .select("request_id,tx_hash,resource_hash,execution_authorized,delivered_at")
      .eq("request_id", pilot.request_id)
      .maybeSingle(),
    db
      .from("agent_goat_pilot_resources")
      .select("request_id,resource_hash,payload")
      .eq("request_id", pilot.request_id)
      .maybeSingle(),
  ]);

  if (fulfillmentError || resourceError) {
    return jsonResponse({ ok: false, error: "GOAT_PAID_ARTIFACT_LEDGER_UNAVAILABLE", execution_authorized: false }, 503);
  }
  if (!fulfillment || !resource) {
    return jsonResponse({ ok: false, error: "GOAT_PAYMENT_NOT_FULFILLED", execution_authorized: false }, 402);
  }
  if (
    fulfillment.execution_authorized !== false ||
    fulfillment.resource_hash !== resource.resource_hash
  ) {
    return jsonResponse({ ok: false, error: "GOAT_FULFILLMENT_EVIDENCE_INVALID", execution_authorized: false }, 503);
  }

  const resourcePayload = asRecord(resource.payload);
  const projectedRiskObject = asRecord(resourcePayload?.risk_object);
  const objectId = typeof projectedRiskObject?.object_id === "string"
    ? projectedRiskObject.object_id
    : "";

  if (!objectId) {
    return jsonResponse({ ok: false, error: "GOAT_RISK_OBJECT_REFERENCE_MISSING", execution_authorized: false }, 503);
  }

  const { data: storedRiskObject, error: riskObjectError } = await db
    .from("geomacro_risk_objects")
    .select("object_id,payload")
    .eq("object_id", objectId)
    .maybeSingle();

  if (riskObjectError) {
    return jsonResponse({ ok: false, error: "RISK_OBJECT_LEDGER_UNAVAILABLE", execution_authorized: false }, 503);
  }
  if (!storedRiskObject?.payload || storedRiskObject.object_id !== objectId) {
    return jsonResponse({ ok: false, error: "RISK_OBJECT_NOT_FOUND", execution_authorized: false }, 404);
  }

  if (containsForbiddenPublicSourceKeys(storedRiskObject.payload)) {
    return jsonResponse({ ok: false, error: "RISK_OBJECT_PUBLIC_PRIVACY_BOUNDARY_VIOLATION", execution_authorized: false }, 503);
  }

  const verification = verifyPublicRiskObjectArtifact(storedRiskObject.payload);
  if (!verification.valid || !verification.cryptographic_valid) {
    return jsonResponse(
      {
        ok: false,
        error: "RISK_OBJECT_PUBLIC_VERIFICATION_FAILED",
        verification,
        execution_authorized: false,
      },
      503,
    );
  }

  return jsonResponse({
    ok: true,
    state: "DELIVERED",
    request_id: pilot.request_id,
    client_request_id: pilot.idempotency_key,
    environment: pilot.environment,
    payment: {
      transaction_hash: fulfillment.tx_hash,
      fulfilled_at: fulfillment.delivered_at,
      commercial_revenue: false,
    },
    risk_object: storedRiskObject.payload,
    verification,
    execution_authorized: false,
  });
}

export const Route = createFileRoute("/api/goat/pilot/artifact")({
  server: {
    handlers: {
      POST: async ({ request }) => handlePost(request),
    },
  },
});
