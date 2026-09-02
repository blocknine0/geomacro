import type {
  PaymentRequirement,
  PaymentSettlement,
  X402Adapter,
} from "@/lib/agent-payment.server";

/**
 * Official x402 integration boundary.
 *
 * This adapter intentionally fails closed until a facilitator SDK and its
 * server credentials are configured. A payment header must never be treated
 * as settled merely because it is present.
 */
export type X402FacilitatorClient = {
  verify: (input: {
    paymentHeader: string;
    requirement: PaymentRequirement;
    request: Request;
  }) => Promise<boolean>;
  settle: (input: {
    paymentHeader: string;
    requirement: PaymentRequirement;
    request: Request;
  }) => Promise<{ reference: string | null }>;
};

export function createX402Adapter(client?: X402FacilitatorClient): X402Adapter {
  return {
    verifyAndSettle: async ({
      request,
      requirement,
      paymentHeader,
    }): Promise<PaymentSettlement> => {
      if (!client) {
        return {
          status: "failed",
          provider: "x402",
          reference: null,
          errorCode: "PAYMENT_SETTLEMENT_FAILED",
        };
      }
      try {
        const valid = await client.verify({ request, requirement, paymentHeader });
        if (!valid)
          return {
            status: "failed",
            provider: "x402",
            reference: null,
            errorCode: "PAYMENT_INVALID",
          };
        const settled = await client.settle({ request, requirement, paymentHeader });
        return { status: "accepted", provider: "x402", reference: settled.reference };
      } catch {
        return {
          status: "failed",
          provider: "x402",
          reference: null,
          errorCode: "PAYMENT_SETTLEMENT_FAILED",
        };
      }
    },
  };
}
