export type TestnetTesterPaymentActivation = {
  ok: false;
  code: "TESTNET_UPFRONT_ACTIVATION_RETIRED";
  payment_model: "pay_per_call";
};

export async function activateTestnetTesterPayment(): Promise<TestnetTesterPaymentActivation> {
  return {
    ok: false,
    code: "TESTNET_UPFRONT_ACTIVATION_RETIRED",
    payment_model: "pay_per_call",
  };
}
