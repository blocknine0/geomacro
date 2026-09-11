import { describe, expect, it } from "vitest";
import {
  validateGoatCreateOrderInput,
  verifyGoatPaidOrder,
  type GoatFlowCreateOrderInput,
  type GoatFlowOrder,
} from "../lib/goat-flow.server";

const repetitions = Number(process.env.GOAT_ACCEPTANCE_ITERATIONS || "250");
const count = Number.isSafeInteger(repetitions) && repetitions > 0 && repetitions <= 500
  ? repetitions
  : 250;

const baseInput: GoatFlowCreateOrderInput = {
  dapp_order_id: "geomacro-readiness",
  from_address: "0x2222222222222222222222222222222222222222",
  amount_wei: "100000",
  token_symbol: "USDC",
  token_contract: "0x1111111111111111111111111111111111111111",
};

function order(overrides: Partial<GoatFlowOrder> = {}): GoatFlowOrder {
  return {
    order_id: "goat-order-readiness",
    merchant_id: "merchant_readiness",
    dapp_order_id: baseInput.dapp_order_id,
    chain_id: 48816,
    token_contract: baseInput.token_contract,
    token_symbol: baseInput.token_symbol,
    from_address: baseInput.from_address,
    amount_wei: baseInput.amount_wei,
    status: "PAYMENT_CONFIRMED",
    tx_hash: `0x${"a".repeat(64)}`,
    confirmed_at: "2026-09-11T10:49:14.000Z",
    ...overrides,
  };
}

const expected = {
  order_id: "goat-order-readiness",
  dapp_order_id: baseInput.dapp_order_id,
  from_address: baseInput.from_address,
  chain_id: 48816,
  token_contract: baseInput.token_contract,
  token_symbol: baseInput.token_symbol,
  amount_wei: baseInput.amount_wei,
};

const cases = [
  () => expect(validateGoatCreateOrderInput(baseInput, "testnet3").chain_id).toBe(48816),
  () => expect(validateGoatCreateOrderInput(baseInput, "mainnet").chain_id).toBe(2345),
  () => expect(() => validateGoatCreateOrderInput({ ...baseInput, amount_wei: "0" }, "testnet3")).toThrow(),
  () => expect(() => validateGoatCreateOrderInput({ ...baseInput, from_address: "0x1234" }, "testnet3")).toThrow(),
  () => expect(verifyGoatPaidOrder(order(), expected).tx_hash).toMatch(/^0x[a-f0-9]{64}$/),
  () => expect(() => verifyGoatPaidOrder(order({ chain_id: 1 }), expected)).toThrow(),
  () => expect(() => verifyGoatPaidOrder(order({ token_symbol: "USDT" }), expected)).toThrow(),
  () => expect(() => verifyGoatPaidOrder(order({ amount_wei: "99999" }), expected)).toThrow(),
  () => expect(() => verifyGoatPaidOrder(order({ tx_hash: null }), expected)).toThrow(),
  () => expect(() => verifyGoatPaidOrder(order({ confirmed_at: null }), expected)).toThrow(),
];

describe("GOAT repeated readiness acceptance", () => {
  for (let i = 0; i < count; i += 1) {
    it(`repeated case ${i + 1} of ${count}`, () => {
      cases[i % cases.length]();
    });
  }
});
