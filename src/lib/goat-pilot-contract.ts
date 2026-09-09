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

/**
 * A GOAT partner-pilot order always requires a buyer-controlled wallet address
 * and a stable client request ID. Price/token/payment terms are server-owned and
 * therefore deliberately absent from the caller-controlled schema.
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
