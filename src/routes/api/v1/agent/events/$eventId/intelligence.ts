import { createFileRoute } from "@tanstack/react-router";
import { getRequestIP } from "@tanstack/react-start/server";
import { z } from "zod";
import {
  AGENT_CAPABILITIES,
  AGENT_ERROR_CODES,
  AGENT_ERROR_STATUS,
  agentError,
  GEOMACRO_AGENT_API_VERSION,
  GEOMACRO_AGENT_SCHEMA_VERSION,
} from "@/lib/agent/agent-api-contract";
import { getEventIntelligence } from "@/lib/agent-intelligence.server";
import { settleAgentPayment } from "@/lib/agent-payment.server";
import {
  deriveExternalAgentId,
  finishAgentRequest,
  recordAgentPayment,
  startAgentRequest,
} from "@/lib/agent-telemetry.server";

const EventId = z.string().trim().uuid();

function errorResponse(
  code: (typeof AGENT_ERROR_CODES)[keyof typeof AGENT_ERROR_CODES],
  details?: Record<string, unknown>,
) {
  return Response.json(
    {
      apiVersion: GEOMACRO_AGENT_API_VERSION,
      schemaVersion: GEOMACRO_AGENT_SCHEMA_VERSION,
      ...agentError(code, details),
    },
    {
      status: AGENT_ERROR_STATUS[code],
      headers: { "Cache-Control": "no-store" },
    },
  );
}

async function deliverIntelligence(input: {
  eventId: string;
  requestId: string | null;
  paymentId?: string | null;
  idempotent?: boolean;
}) {
  const intelligence = await getEventIntelligence(input.eventId);
  if (!intelligence) {
    await finishAgentRequest({
      requestId: input.requestId,
      status: "not_found",
      httpStatus: 404,
      ...(input.paymentId !== undefined ? { paymentId: input.paymentId } : {}),
      responseCode: AGENT_ERROR_CODES.INTELLIGENCE_NOT_FOUND,
    });
    return errorResponse(AGENT_ERROR_CODES.INTELLIGENCE_NOT_FOUND);
  }

  await finishAgentRequest({
    requestId: input.requestId,
    status: "delivered",
    httpStatus: 200,
    ...(input.paymentId !== undefined ? { paymentId: input.paymentId } : {}),
  });

  return Response.json(
    {
      apiVersion: GEOMACRO_AGENT_API_VERSION,
      schemaVersion: GEOMACRO_AGENT_SCHEMA_VERSION,
      capability: AGENT_CAPABILITIES.EVENT_INTELLIGENCE,
      data: intelligence,
      ...(input.idempotent ? { idempotent: true } : {}),
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

export const Route = createFileRoute("/api/v1/agent/events/$eventId/intelligence")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const parsed = EventId.safeParse(params.eventId);
        if (!parsed.success) return errorResponse(AGENT_ERROR_CODES.INVALID_REQUEST);

        const ip = getRequestIP({ xForwardedFor: true }) ?? null;
        const externalAgentId = deriveExternalAgentId(request, ip);
        const idempotencyKey =
          request.headers.get("Idempotency-Key")?.trim().slice(0, 200) ?? null;

        const telemetry = await startAgentRequest({
          capability: AGENT_CAPABILITIES.EVENT_INTELLIGENCE,
          eventId: parsed.data,
          idempotencyKey,
          externalAgentId,
        });

        try {
          // A previously delivered, settled request may be replayed without charging again.
          if (telemetry.delivered) {
            return await deliverIntelligence({
              eventId: parsed.data,
              requestId: telemetry.requestId,
              idempotent: true,
            });
          }

          // A settled request whose delivery previously failed may retry delivery without
          // creating a second payment. This is the only other settlement bypass.
          if (telemetry.paymentSettled) {
            return await deliverIntelligence({
              eventId: parsed.data,
              requestId: telemetry.requestId,
              idempotent: true,
            });
          }

          // Phase 1 intentionally passes no facilitator adapter. Therefore a payment can
          // never be accepted on this branch until the official GOAT adapter is wired.
          const payment = await settleAgentPayment(request);
          if (!payment.ok) {
            await finishAgentRequest({
              requestId: telemetry.requestId,
              status:
                payment.code === AGENT_ERROR_CODES.PAYMENT_REQUIRED
                  ? "payment_required"
                  : "payment_failed",
              httpStatus: AGENT_ERROR_STATUS[payment.code],
              responseCode: payment.code,
            });

            const details = payment.requirement
              ? {
                  payment: {
                    capability: payment.requirement.capability,
                    amount: payment.requirement.amount,
                    asset: payment.requirement.asset,
                    network: payment.requirement.network,
                    rail: payment.requirement.rail,
                    payTo: payment.requirement.payTo,
                  },
                }
              : undefined;
            return errorResponse(payment.code, details);
          }

          const paymentId = await recordAgentPayment({
            requestId: telemetry.requestId,
            requirement: payment.requirement,
            status: "settled",
            providerReference: payment.payment.reference,
          });

          return await deliverIntelligence({
            eventId: parsed.data,
            requestId: telemetry.requestId,
            paymentId,
          });
        } catch (error) {
          console.error("[agent-api] intelligence delivery failed", error);
          await finishAgentRequest({
            requestId: telemetry.requestId,
            status: "delivery_failed",
            httpStatus: 503,
            responseCode: AGENT_ERROR_CODES.UPSTREAM_UNAVAILABLE,
          });
          return errorResponse(AGENT_ERROR_CODES.UPSTREAM_UNAVAILABLE);
        }
      },
    },
  },
});
