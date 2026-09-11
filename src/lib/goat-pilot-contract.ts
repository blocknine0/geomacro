import { z } from "zod";
import {
  agenticDemoRequestSchema,
} from "./agentic-demo-contract";

const evmAddress = z
  .string()
  .trim()
  .regex(/^0x[a-fA-F0-9]{40}$/)
  .transform((value) => value.toLowerCase());

const clientRequestId = z
  .string()
  .trim()
  .min(4)
  .max(128)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{3,127}$/);

const positiveAtomicAmount = z
  .string()
  .trim()
  .regex(/^[1-9][0-9]{0,77}$/);

/**
 * A GOAT partner-pilot order always requires a buyer-controlled wallet address
 * and a stable client request ID. Server price/token terms remain server-owned.
 * The optional max_payment_atomic is only a buyer policy ceiling: it cannot
 * lower or rewrite the server price and lets an autonomous agent fail closed
 * before an over-budget challenge/order is prepared.
 */
export const goatPilotCreateOrderSchema =
  agenticDemoRequestSchema
    .omit({
      client_request_id: true,
    })
    .extend({
      client_request_id:
        clientRequestId,
      payer_address:
        evmAddress,
      max_payment_atomic:
        positiveAtomicAmount.optional(),
    });

export type GoatPilotCreateOrderRequest =
  z.infer<
    typeof goatPilotCreateOrderSchema
  >;

export const goatPilotStatusSchema =
  z.object({
    client_request_id:
      clientRequestId,
    payer_address:
      evmAddress,
  });

export type GoatPilotStatusRequest =
  z.infer<
    typeof goatPilotStatusSchema
  >;

export const GOAT_PILOT_VERSION =
  "goat-risk-preflight-pilot-v1" as const;
export const GOAT_PILOT_SKU =
  "risk_preflight_v1" as const;
