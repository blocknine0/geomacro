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
import { getAgentPaymentConfig } from "@/lib/agent-payment.server";
import {
  claimGoatOrderCreation,
  createGoatOrder,
  markGoatOrderCreationAttempted,
  persistConfirmedGoatSettlement,
  persistGoatOrder,
  releaseGoatOrderCreation,
  verifyGoatOrderSettlement,
} from "@/lib/agent/goat-order.server";
import { getGoatFlowRuntimeConfig } from "@/lib/agent/goat-flow.server";
import {
  deriveExternalAgentId,
  finishAgentRequest,
  getGoatOrderForRequest,
  getGoatRequestEntitlement,
  recordAgentPayment,
  startAgentRequest,
} from "@/lib/agent-telemetry.server";

const EventId = z.string().trim().uuid();

const EvmAddress = z.string().trim().regex(/^0x[a-fA-F0-9]{40}$/);

function buildDappOrderId(requestId: string): string {
  return `geomacro-agent-${requestId}`;
}

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
        if (!parsed.success) {
          return errorResponse(AGENT_ERROR_CODES.INVALID_REQUEST);
        }

        const payer = EvmAddress.safeParse(
          request.headers.get("X-Agent-Wallet"),
        );
        if (!payer.success) {
          return errorResponse(AGENT_ERROR_CODES.INVALID_REQUEST, {
            requiredHeader: "X-Agent-Wallet",
          });
        }

        const idempotencyKey =
          request.headers.get("Idempotency-Key")?.trim().slice(0, 200) ?? null;

        if (!idempotencyKey) {
          return errorResponse(AGENT_ERROR_CODES.INVALID_REQUEST, {
            requiredHeader: "Idempotency-Key",
          });
        }

        const ip = getRequestIP({ xForwardedFor: true }) ?? null;
        const externalAgentId = deriveExternalAgentId(request, ip);

        if (!externalAgentId) {
          return errorResponse(AGENT_ERROR_CODES.PAYMENT_NOT_CONFIGURED);
        }

        const telemetry = await startAgentRequest({
          capability: AGENT_CAPABILITIES.EVENT_INTELLIGENCE,
          eventId: parsed.data,
          idempotencyKey,
          externalAgentId,
        });

        if (!telemetry.requestId) {
          return errorResponse(AGENT_ERROR_CODES.UPSTREAM_UNAVAILABLE);
        }

        try {
          const entitlement = await getGoatRequestEntitlement(
            telemetry.requestId,
          );

          if (entitlement.settled) {
            return await deliverIntelligence({
              eventId: parsed.data,
              requestId: telemetry.requestId,
              idempotent: true,
            });
          }

          const config = getAgentPaymentConfig();
          const goatConfig = getGoatFlowRuntimeConfig();

          const expectedNetwork =
            goatConfig.chainId ? `eip155:${goatConfig.chainId}` : null;

          const configurationMatches =
            goatConfig.configured &&
            config.rail === "goat-flow" &&
            expectedNetwork === config.network &&
            goatConfig.tokenContract?.toLowerCase() ===
              config.asset.toLowerCase() &&
            goatConfig.receiveAddress?.toLowerCase() ===
              config.payTo.toLowerCase();

          if (
            !config.enabled ||
            !config.amount ||
            !config.asset ||
            !config.network ||
            !config.rail ||
            !config.payTo ||
            !configurationMatches
          ) {
            await finishAgentRequest({
              requestId: telemetry.requestId,
              status: "payment_failed",
              httpStatus: 503,
              responseCode: AGENT_ERROR_CODES.PAYMENT_NOT_CONFIGURED,
            });
            return errorResponse(AGENT_ERROR_CODES.PAYMENT_NOT_CONFIGURED);
          }

          const existingOrder = await getGoatOrderForRequest(
            telemetry.requestId,
          );

          const dappOrderId =
            existingOrder?.dappOrderId ??
            buildDappOrderId(telemetry.requestId);

          const intent = {
            requestId: telemetry.requestId,
            dappOrderId,
            payerAddress: payer.data,
            amountWei: config.amount,
          };

          if (existingOrder) {
            if (
              existingOrder.payerAddress.toLowerCase() !==
                payer.data.toLowerCase() ||
              existingOrder.amountWei !== config.amount
            ) {
              return errorResponse(AGENT_ERROR_CODES.PAYMENT_INVALID);
            }

            if (
              existingOrder.orderStatus === "FAILED" ||
              existingOrder.orderStatus === "EXPIRED" ||
              existingOrder.orderStatus === "CANCELLED"
            ) {
              await finishAgentRequest({
                requestId: telemetry.requestId,
                status: "payment_failed",
                httpStatus: 402,
                responseCode: AGENT_ERROR_CODES.PAYMENT_SETTLEMENT_FAILED,
              });

              return errorResponse(
                AGENT_ERROR_CODES.PAYMENT_SETTLEMENT_FAILED,
                {
                  payment: {
                    provider: "goat-flow",
                    orderId: existingOrder.goatOrderId,
                    status: existingOrder.orderStatus,
                  },
                },
              );
            }

            const verification = await verifyGoatOrderSettlement(
              existingOrder.goatOrderId,
              intent,
            );

            if (verification.settled && verification.proof) {
              await persistConfirmedGoatSettlement({
                requestId: telemetry.requestId,
                proof: verification.proof,
              });

              const paymentId = await recordAgentPayment({
                requestId: telemetry.requestId,
                requirement: {
                  amount: config.amount,
                  asset: config.asset,
                  network: config.network,
                  rail: config.rail,
                },
                status: "settled",
                providerReference: verification.proof.txHash ?? null,
              });

              if (!paymentId) {
                throw new Error("Settlement payment record unavailable");
              }

              return await deliverIntelligence({
                eventId: parsed.data,
                requestId: telemetry.requestId,
                paymentId,
              });
            }

            await finishAgentRequest({
              requestId: telemetry.requestId,
              status: "payment_required",
              httpStatus: 402,
              responseCode: AGENT_ERROR_CODES.PAYMENT_REQUIRED,
            });

            return errorResponse(AGENT_ERROR_CODES.PAYMENT_REQUIRED, {
              payment: {
                provider: "goat-flow",
                orderId: existingOrder.goatOrderId,
                dappOrderId: existingOrder.dappOrderId,
                amount: existingOrder.amountWei,
                asset: config.asset,
                network: config.network,
              },
            });
          }

          const creationClaim = await claimGoatOrderCreation({
            requestId: telemetry.requestId,
            dappOrderId,
          });

          if (!creationClaim.acquired) {
            // Another request is currently creating the durable GOAT order.
            // Re-read once in case it completed between claim contention and now.
            const racedOrder = await getGoatOrderForRequest(
              telemetry.requestId,
            );

            if (racedOrder) {
              return errorResponse(AGENT_ERROR_CODES.PAYMENT_REQUIRED, {
                payment: {
                  provider: "goat-flow",
                  orderId: racedOrder.goatOrderId,
                  dappOrderId: racedOrder.dappOrderId,
                  amount: racedOrder.amountWei,
                  asset: config.asset,
                  network: config.network,
                },
              });
            }

            return errorResponse(
              AGENT_ERROR_CODES.UPSTREAM_UNAVAILABLE,
              {
                retryAfterMs: 1000,
              },
            );
          }

          let orderPersisted = false;

          try {
            const providerAttemptMarked =
              await markGoatOrderCreationAttempted({
                requestId: telemetry.requestId,
                claimToken: creationClaim.claimToken,
              });

            if (!providerAttemptMarked) {
              throw new Error(
                "GOAT provider creation attempt could not be durably recorded",
              );
            }

            const order = await createGoatOrder(intent);

            if (!order) {
              await releaseGoatOrderCreation({
                requestId: telemetry.requestId,
                claimToken: creationClaim.claimToken,
              });

              await finishAgentRequest({
                requestId: telemetry.requestId,
                status: "payment_failed",
                httpStatus: 503,
                responseCode: AGENT_ERROR_CODES.PAYMENT_NOT_CONFIGURED,
              });

              return errorResponse(
                AGENT_ERROR_CODES.PAYMENT_NOT_CONFIGURED,
              );
            }

            await persistGoatOrder({
              requestId: telemetry.requestId,
              dappOrderId,
              payerAddress: payer.data,
              order,
            });

            orderPersisted = true;

            await releaseGoatOrderCreation({
              requestId: telemetry.requestId,
              claimToken: creationClaim.claimToken,
            });

            await finishAgentRequest({
              requestId: telemetry.requestId,
              status: "payment_required",
              httpStatus: 402,
              responseCode: AGENT_ERROR_CODES.PAYMENT_REQUIRED,
            });

            return errorResponse(AGENT_ERROR_CODES.PAYMENT_REQUIRED, {
              payment: {
                provider: "goat-flow",
                orderId: order.orderId,
                dappOrderId,
                flow: order.flow,
                amount: order.amountWei,
                tokenSymbol: order.tokenSymbol,
                tokenContract: order.tokenContract,
                payTo: order.payToAddress,
                fromChainId: order.fromChainId,
                payToChainId: order.payToChainId,
                expiresAt: order.expiresAt,
                x402: order.x402 ?? null,
              },
            });
          } catch (error) {
            // If the provider call may have succeeded but local persistence did
            // not, do NOT release immediately. The lease remains active so a
            // concurrent retry cannot blindly create another external order.
            if (orderPersisted) {
              await releaseGoatOrderCreation({
                requestId: telemetry.requestId,
                claimToken: creationClaim.claimToken,
              });
            }

            throw error;
          }
        } catch (error) {
          console.error("[agent-api] GOAT payment flow failed", error);

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
