import {
  createHash,
  randomUUID,
} from "node:crypto";

import {
  canonicalJson,
} from "./canonical-json";
import {
  runAgenticPreflightDemo,
} from "./agentic-demo-service.server";
import {
  GOAT_PILOT_SKU,
  GOAT_PILOT_VERSION,
  type GoatPilotCreateOrderRequest,
  type GoatPilotStatusRequest,
} from "./goat-pilot-contract";
import {
  GOAT_FLOW_ENVIRONMENTS,
  createGoatFlowOrder,
  getGoatFlowOrder,
  requireGoatFlowConfig,
  resolveGoatPilotToken,
  validateGoatCreateOrderInput,
  verifyGoatPaidOrder,
  isGoatPaidStatus,
  isGoatTerminalFailureStatus,
  type GoatFlowEnvironment,
  type GoatFlowOrder,
  type GoatFlowPaymentChallenge,
} from "./goat-flow.server";
import {
  requireRiskSupabase,
} from "./risk-supabase.server";

const PILOT_AMOUNT_RE = /^(0|[1-9][0-9]{0,77})$/;
const TX_HASH_RE = /^0x[a-f0-9]{64}$/;

export class GoatPilotError extends Error {
  readonly code: string;
  readonly httpStatus: number;
  readonly retryable: boolean;

  constructor(
    code: string,
    message: string,
    httpStatus = 503,
    retryable = false,
  ) {
    super(message);
    this.name = "GoatPilotError";
    this.code = code;
    this.httpStatus = httpStatus;
    this.retryable = retryable;
  }
}

type PilotRequestRow = {
  request_id: string;
  external_agent_id: string;
  idempotency_key: string;
  request_hash: string;
  sku: typeof GOAT_PILOT_SKU;
  environment: GoatFlowEnvironment;
  merchant_id: string;
  payer_address: string;
  token_symbol: string;
  token_contract: string;
  amount_wei: string;
  created_at: string;
};

type ResourceRow = {
  request_id: string;
  resource_hash: string;
  payload: Record<string, unknown>;
  prepared_at: string;
};

type OrderRow = {
  request_id: string;
  goat_order_id: string;
  dapp_order_id: string;
  payer_address: string;
  source_chain_id: number;
  token_symbol: string;
  token_contract: string;
  amount_wei: string;
  pay_to_address: string;
  order_status: string;
  payment_flow: string;
  tx_hash: string | null;
  expires_at: string | null;
  confirmed_at: string | null;
};

type ChallengeRow = {
  request_id: string;
  goat_order_id: string;
  challenge_hash: string;
  challenge: Record<string, unknown>;
};

type FulfillmentRow = {
  request_id: string;
  payment_id: string;
  goat_order_id: string;
  tx_hash: string;
  resource_hash: string;
  execution_authorized: false;
  delivered_at: string;
};

type PaymentRow = {
  id: string;
  amount: string;
  asset: string;
  network: string;
  rail: string;
  provider_reference: string | null;
  settled_at: string | null;
};

function sha256Text(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function externalAgentId(payer: string): string {
  return `goat:sha256:${sha256Text(payer.trim().toLowerCase())}`;
}

function pilotAmountAtomic(): string {
  const value = process.env.GOATX402_PILOT_AMOUNT_ATOMIC?.trim() ?? "";
  if (!PILOT_AMOUNT_RE.test(value) || BigInt(value) <= 0n) {
    throw new GoatPilotError(
      "GOAT_PILOT_PRICE_NOT_CONFIGURED",
      "GOAT partner-pilot test amount is not configured.",
      503,
      false,
    );
  }
  return value;
}

function requirePilotRuntime() {
  let config: ReturnType<typeof requireGoatFlowConfig>;
  try {
    config = requireGoatFlowConfig();
  } catch (error) {
    throw new GoatPilotError(
      "GOAT_PILOT_NOT_CONFIGURED",
      "GOAT partner-pilot merchant configuration is unavailable.",
      503,
      false,
    );
  }

  if (
    config.environment === "mainnet" &&
    process.env.GOATX402_MAINNET_COMMERCIAL_ENABLED?.trim().toLowerCase() !== "true"
  ) {
    throw new GoatPilotError(
      "GOAT_MAINNET_DISABLED",
      "GOAT mainnet commercial fulfillment is disabled until production launch gates pass.",
      503,
      false,
    );
  }

  return config;
}

function riskInputFromCreate(input: GoatPilotCreateOrderRequest) {
  const result: Record<string, unknown> = {
    subject: input.subject,
    policy_preset: input.policy_preset,
    action_type: input.action_type,
    client_request_id: input.client_request_id,
  };
  if (input.amount_usdc !== undefined) {
    result.amount_usdc = input.amount_usdc;
  }
  return result;
}

function safePreparedResource(prepared: Record<string, unknown>) {
  const riskGate = prepared.risk_gate;
  const boundaries = prepared.boundaries;
  if (
    !riskGate ||
    typeof riskGate !== "object" ||
    Array.isArray(riskGate) ||
    (riskGate as { execution_authorized?: unknown }).execution_authorized !== false ||
    !boundaries ||
    typeof boundaries !== "object" ||
    Array.isArray(boundaries) ||
    (boundaries as { execution_authorized?: unknown }).execution_authorized !== false
  ) {
    throw new GoatPilotError(
      "GOAT_RESOURCE_EXECUTION_BOUNDARY_VIOLATION",
      "Prepared intelligence resource violated the non-execution boundary.",
      503,
      false,
    );
  }

  const {
    payment: _payment,
    ...resource
  } = prepared;

  return {
    ...resource,
    mode: "GOAT_X402_PAID",
    product: {
      sku: GOAT_PILOT_SKU,
      structured_delivery_only: true,
      raw_private_warehouse_data_included: false,
    },
  };
}

async function claimPilotRequest(input: {
  externalAgentId: string;
  idempotencyKey: string;
  requestHash: string;
  environment: GoatFlowEnvironment;
  merchantId: string;
  payer: string;
  tokenSymbol: string;
  tokenContract: string;
  amountWei: string;
}) {
  const db = requireRiskSupabase();
  const { data, error } = await db.rpc("claim_agent_goat_pilot_request", {
    p_external_agent_id: input.externalAgentId,
    p_idempotency_key: input.idempotencyKey,
    p_request_hash: input.requestHash,
    p_environment: input.environment,
    p_merchant_id: input.merchantId,
    p_payer_address: input.payer,
    p_token_symbol: input.tokenSymbol,
    p_token_contract: input.tokenContract,
    p_amount_wei: input.amountWei,
  });

  if (error || !Array.isArray(data) || data.length !== 1) {
    throw new GoatPilotError(
      "GOAT_PILOT_REQUEST_LEDGER_UNAVAILABLE",
      "GOAT partner-pilot request ledger is unavailable.",
      503,
      true,
    );
  }

  const row = data[0] as {
    disposition?: unknown;
    request_id?: unknown;
  };
  if (
    !["CLAIMED", "REPLAY", "CONFLICT"].includes(String(row.disposition)) ||
    typeof row.request_id !== "string"
  ) {
    throw new GoatPilotError(
      "GOAT_PILOT_REQUEST_LEDGER_INVALID",
      "GOAT partner-pilot request ledger returned invalid state.",
      503,
      false,
    );
  }

  if (row.disposition === "CONFLICT") {
    throw new GoatPilotError(
      "GOAT_PILOT_IDEMPOTENCY_CONFLICT",
      "client_request_id was already used with different request/payment terms.",
      409,
      false,
    );
  }

  return {
    disposition: row.disposition as "CLAIMED" | "REPLAY",
    requestId: row.request_id,
  };
}

async function loadPilotRequestById(requestId: string): Promise<PilotRequestRow> {
  const db = requireRiskSupabase();
  const { data, error } = await db
    .from("agent_goat_pilot_requests")
    .select("request_id,external_agent_id,idempotency_key,request_hash,sku,environment,merchant_id,payer_address,token_symbol,token_contract,amount_wei,created_at")
    .eq("request_id", requestId)
    .maybeSingle();

  if (error || !data) {
    throw new GoatPilotError(
      "GOAT_PILOT_REQUEST_NOT_FOUND",
      "GOAT partner-pilot request could not be resolved.",
      error ? 503 : 404,
      Boolean(error),
    );
  }
  return data as unknown as PilotRequestRow;
}

async function loadPilotRequestByIdentity(
  input: GoatPilotStatusRequest,
): Promise<PilotRequestRow> {
  const db = requireRiskSupabase();
  const agentId = externalAgentId(input.payer_address);
  const { data, error } = await db
    .from("agent_goat_pilot_requests")
    .select("request_id,external_agent_id,idempotency_key,request_hash,sku,environment,merchant_id,payer_address,token_symbol,token_contract,amount_wei,created_at")
    .eq("external_agent_id", agentId)
    .eq("idempotency_key", input.client_request_id)
    .maybeSingle();

  if (error) {
    throw new GoatPilotError(
      "GOAT_PILOT_REQUEST_LEDGER_UNAVAILABLE",
      "GOAT partner-pilot request ledger is unavailable.",
      503,
      true,
    );
  }
  if (!data) {
    throw new GoatPilotError(
      "GOAT_PILOT_REQUEST_NOT_FOUND",
      "No GOAT partner-pilot request exists for this payer/client_request_id.",
      404,
      false,
    );
  }

  const row = data as unknown as PilotRequestRow;
  if (row.payer_address !== input.payer_address.toLowerCase()) {
    throw new GoatPilotError(
      "GOAT_PILOT_REQUEST_IDENTITY_MISMATCH",
      "GOAT partner-pilot request identity mismatch.",
      409,
      false,
    );
  }
  return row;
}

async function loadResource(requestId: string): Promise<ResourceRow | null> {
  const db = requireRiskSupabase();
  const { data, error } = await db
    .from("agent_goat_pilot_resources")
    .select("request_id,resource_hash,payload,prepared_at")
    .eq("request_id", requestId)
    .maybeSingle();

  if (error) {
    throw new GoatPilotError(
      "GOAT_RESOURCE_LEDGER_UNAVAILABLE",
      "Prepared intelligence resource ledger is unavailable.",
      503,
      true,
    );
  }
  return data ? (data as unknown as ResourceRow) : null;
}

async function ensurePreparedResource(
  requestId: string,
  createInput: GoatPilotCreateOrderRequest,
): Promise<ResourceRow> {
  const existing = await loadResource(requestId);
  if (existing) return existing;

  let prepared: Record<string, unknown>;
  try {
    prepared = await runAgenticPreflightDemo(
      riskInputFromCreate(createInput),
      {
        mode: "GOAT_X402_PAID",
        recordTelemetry: false,
        requestId,
      },
    ) as unknown as Record<string, unknown>;
  } catch (error) {
    console.error("[goat-pilot] intelligence preparation failed", error);
    throw new GoatPilotError(
      "GOAT_INTELLIGENCE_PREPARATION_UNAVAILABLE",
      "Verified Geomacro intelligence could not be prepared for this order.",
      503,
      true,
    );
  }

  const resource = safePreparedResource(prepared);
  const resourceHash = sha256Text(canonicalJson(resource));
  const db = requireRiskSupabase();
  const { error } = await db
    .from("agent_goat_pilot_resources")
    .insert({
      request_id: requestId,
      resource_hash: resourceHash,
      payload: resource,
    });

  if (error) {
    const raced = await loadResource(requestId);
    if (!raced || raced.resource_hash !== resourceHash) {
      throw new GoatPilotError(
        "GOAT_RESOURCE_PERSISTENCE_FAILED",
        "Prepared intelligence resource could not be made durable.",
        503,
        true,
      );
    }
    return raced;
  }

  const persisted = await loadResource(requestId);
  if (!persisted || persisted.resource_hash !== resourceHash) {
    throw new GoatPilotError(
      "GOAT_RESOURCE_PERSISTENCE_FAILED",
      "Prepared intelligence resource could not be verified after persistence.",
      503,
      true,
    );
  }
  return persisted;
}

async function loadOrderBundle(requestId: string): Promise<{
  order: OrderRow;
  challenge: ChallengeRow;
} | null> {
  const db = requireRiskSupabase();
  const [orderResult, challengeResult] = await Promise.all([
    db
      .from("agent_goat_orders")
      .select("request_id,goat_order_id,dapp_order_id,payer_address,source_chain_id,token_symbol,token_contract,amount_wei,pay_to_address,order_status,payment_flow,tx_hash,expires_at,confirmed_at")
      .eq("request_id", requestId)
      .maybeSingle(),
    db
      .from("agent_goat_order_challenges")
      .select("request_id,goat_order_id,challenge_hash,challenge")
      .eq("request_id", requestId)
      .maybeSingle(),
  ]);

  if (orderResult.error || challengeResult.error) {
    throw new GoatPilotError(
      "GOAT_ORDER_LEDGER_UNAVAILABLE",
      "GOAT order ledger is unavailable.",
      503,
      true,
    );
  }

  if (!orderResult.data && !challengeResult.data) return null;
  if (!orderResult.data || !challengeResult.data) {
    throw new GoatPilotError(
      "GOAT_ORDER_LEDGER_INCONSISTENT",
      "GOAT order evidence is incomplete and requires reconciliation.",
      503,
      false,
    );
  }

  return {
    order: orderResult.data as unknown as OrderRow,
    challenge: challengeResult.data as unknown as ChallengeRow,
  };
}

async function readCreationClaim(requestId: string) {
  const db = requireRiskSupabase();
  const { data, error } = await db
    .from("agent_goat_order_creation_claims")
    .select("request_id,dapp_order_id,provider_creation_attempted_at,lease_expires_at")
    .eq("request_id", requestId)
    .maybeSingle();

  if (error) {
    throw new GoatPilotError(
      "GOAT_ORDER_CLAIM_UNAVAILABLE",
      "GOAT external-order claim ledger is unavailable.",
      503,
      true,
    );
  }
  return data as null | {
    request_id: string;
    dapp_order_id: string;
    provider_creation_attempted_at: string | null;
    lease_expires_at: string;
  };
}

async function createOrLoadGoatOrder(
  pilot: PilotRequestRow,
): Promise<{ order: OrderRow; challenge: ChallengeRow }> {
  const existing = await loadOrderBundle(pilot.request_id);
  if (existing) return existing;

  const dappOrderId = `geomacro-goat-${pilot.request_id.replace(/-/g, "")}`;
  const claimToken = randomUUID();
  const db = requireRiskSupabase();

  const validatedOrderInput = validateGoatCreateOrderInput(
    {
      dapp_order_id: dappOrderId,
      from_address: pilot.payer_address,
      amount_wei: pilot.amount_wei,
      token_symbol: pilot.token_symbol,
      token_contract: pilot.token_contract,
    },
    pilot.environment,
  );

  const { data: claimed, error: claimError } = await db.rpc(
    "claim_agent_goat_order_creation",
    {
      p_request_id: pilot.request_id,
      p_dapp_order_id: dappOrderId,
      p_claim_token: claimToken,
      p_lease_seconds: 60,
    },
  );

  if (claimError) {
    throw new GoatPilotError(
      "GOAT_ORDER_CLAIM_UNAVAILABLE",
      "GOAT external-order claim could not be acquired.",
      503,
      true,
    );
  }

  if (claimed !== true) {
    const raced = await loadOrderBundle(pilot.request_id);
    if (raced) return raced;

    const claim = await readCreationClaim(pilot.request_id);
    if (claim?.provider_creation_attempted_at) {
      throw new GoatPilotError(
        "GOAT_ORDER_RECONCILIATION_REQUIRED",
        "A prior GOAT order creation attempt has an ambiguous local result. Reconcile it before creating another payment order.",
        503,
        false,
      );
    }

    throw new GoatPilotError(
      "GOAT_ORDER_CREATION_IN_PROGRESS",
      "An identical GOAT order is already being prepared.",
      409,
      true,
    );
  }

  const { data: marked, error: markError } = await db.rpc(
    "mark_agent_goat_order_creation_attempted",
    {
      p_request_id: pilot.request_id,
      p_claim_token: claimToken,
    },
  );

  if (markError || marked !== true) {
    throw new GoatPilotError(
      "GOAT_ORDER_CLAIM_LOST",
      "GOAT external-order claim could not be marked before provider call.",
      503,
      true,
    );
  }

  let providerChallenge: GoatFlowPaymentChallenge;
  try {
    providerChallenge = await createGoatFlowOrder(validatedOrderInput);
  } catch (error) {
    console.error("[goat-pilot] GOAT create-order result ambiguous after provider attempt", error);
    throw new GoatPilotError(
      "GOAT_ORDER_RECONCILIATION_REQUIRED",
      "GOAT order creation may have reached the provider. Reconcile before retrying payment creation.",
      503,
      false,
    );
  }

  const normalizedChallenge = providerChallenge;
  const challengeHash = sha256Text(canonicalJson(normalizedChallenge));

  const persistArgs = {
    p_request_id: pilot.request_id,
    p_claim_token: claimToken,
    p_goat_order_id: normalizedChallenge.order_id,
    p_dapp_order_id: normalizedChallenge.dapp_order_id,
    p_pay_to_address: normalizedChallenge.pay_to,
    p_payment_flow: normalizedChallenge.flow,
    p_expires_at: new Date(normalizedChallenge.expires_at * 1000).toISOString(),
    p_challenge_hash: challengeHash,
    p_challenge: normalizedChallenge,
  };

  let persisted = false;
  let lastPersistError: unknown = null;
  for (let attempt = 0; attempt < 2 && !persisted; attempt += 1) {
    const result = await db.rpc("persist_agent_goat_pilot_order", persistArgs);
    if (!result.error && result.data === true) {
      persisted = true;
      break;
    }
    lastPersistError = result.error;
  }

  if (!persisted) {
    console.error("[goat-pilot] provider order exists but local order persistence failed", lastPersistError);
    throw new GoatPilotError(
      "GOAT_ORDER_RECONCILIATION_REQUIRED",
      "GOAT order exists at the provider but local evidence persistence requires reconciliation.",
      503,
      false,
    );
  }

  const saved = await loadOrderBundle(pilot.request_id);
  if (!saved || saved.challenge.challenge_hash !== challengeHash) {
    throw new GoatPilotError(
      "GOAT_ORDER_PERSISTENCE_INVALID",
      "Persisted GOAT order evidence could not be verified.",
      503,
      false,
    );
  }
  return saved;
}

async function loadFulfillment(requestId: string): Promise<FulfillmentRow | null> {
  const db = requireRiskSupabase();
  const { data, error } = await db
    .from("agent_goat_pilot_fulfillments")
    .select("request_id,payment_id,goat_order_id,tx_hash,resource_hash,execution_authorized,delivered_at")
    .eq("request_id", requestId)
    .maybeSingle();

  if (error) {
    throw new GoatPilotError(
      "GOAT_FULFILLMENT_LEDGER_UNAVAILABLE",
      "GOAT fulfillment ledger is unavailable.",
      503,
      true,
    );
  }
  return data ? (data as unknown as FulfillmentRow) : null;
}

async function loadPayment(paymentId: string): Promise<PaymentRow> {
  const db = requireRiskSupabase();
  const { data, error } = await db
    .from("agent_payments")
    .select("id,amount,asset,network,rail,provider_reference,settled_at")
    .eq("id", paymentId)
    .maybeSingle();

  if (error || !data) {
    throw new GoatPilotError(
      "GOAT_PAYMENT_EVIDENCE_UNAVAILABLE",
      "GOAT payment evidence is unavailable.",
      503,
      true,
    );
  }
  return data as unknown as PaymentRow;
}

function assertProviderOrderIdentity(
  order: GoatFlowOrder,
  pilot: PilotRequestRow,
  localOrder: OrderRow,
) {
  const expectedChain = GOAT_FLOW_ENVIRONMENTS[pilot.environment].chain_id;
  if (
    order.merchant_id !== pilot.merchant_id ||
    order.order_id !== localOrder.goat_order_id ||
    order.dapp_order_id !== localOrder.dapp_order_id ||
    order.from_address !== pilot.payer_address ||
    order.chain_id !== expectedChain ||
    order.token_contract !== pilot.token_contract ||
    order.token_symbol !== pilot.token_symbol ||
    order.amount_wei !== pilot.amount_wei
  ) {
    throw new GoatPilotError(
      "GOAT_ORDER_RECONCILIATION_MISMATCH",
      "GOAT provider order no longer matches the persisted Geomacro order terms.",
      409,
      false,
    );
  }
}

async function updateNonPaidProviderState(
  requestId: string,
  order: GoatFlowOrder,
) {
  const db = requireRiskSupabase();
  const updates: Record<string, unknown> = {
    order_status: order.status,
  };
  if (order.tx_hash) updates.tx_hash = order.tx_hash;
  if (order.confirmed_at) updates.confirmed_at = order.confirmed_at;

  const { error } = await db
    .from("agent_goat_orders")
    .update(updates)
    .eq("request_id", requestId);

  if (error) {
    throw new GoatPilotError(
      "GOAT_ORDER_LEDGER_UPDATE_FAILED",
      "GOAT order lifecycle could not be updated.",
      503,
      true,
    );
  }

  if (isGoatTerminalFailureStatus(order.status)) {
    await db
      .from("agent_api_requests")
      .update({
        status: "payment_failed",
        http_status: 402,
        response_code: `GOAT_${order.status}`,
        completed_at: new Date().toISOString(),
      })
      .eq("id", requestId);
  }
}

async function deliveredResponse(
  pilot: PilotRequestRow,
  fulfillment: FulfillmentRow,
) {
  const [resource, payment] = await Promise.all([
    loadResource(pilot.request_id),
    loadPayment(fulfillment.payment_id),
  ]);

  if (
    !resource ||
    resource.resource_hash !== fulfillment.resource_hash ||
    fulfillment.execution_authorized !== false ||
    payment.provider_reference !== fulfillment.tx_hash
  ) {
    throw new GoatPilotError(
      "GOAT_FULFILLMENT_EVIDENCE_INVALID",
      "GOAT paid fulfillment evidence failed integrity checks.",
      503,
      false,
    );
  }

  return {
    ok: true as const,
    pilot_version: GOAT_PILOT_VERSION,
    sku: GOAT_PILOT_SKU,
    state: "DELIVERED" as const,
    request_id: pilot.request_id,
    client_request_id: pilot.idempotency_key,
    environment: pilot.environment,
    payment: {
      provider: "goat_flow_x402" as const,
      status: "SETTLED" as const,
      asset: payment.asset,
      network: payment.network,
      amount_atomic: payment.amount,
      rail: payment.rail,
      transaction_hash: fulfillment.tx_hash,
      settled_at: payment.settled_at,
      commercial_revenue:
        GOAT_FLOW_ENVIRONMENTS[pilot.environment].commercial_revenue,
      note:
        pilot.environment === "testnet3"
          ? "GOAT Testnet3 partner proof only. Testnet settlement is not commercial revenue."
          : "Production settlement evidence; revenue recognition still follows Geomacro accounting/legal policy.",
    },
    resource_hash: resource.resource_hash,
    resource: resource.payload,
    execution_authorized: false as const,
  };
}

export async function prepareGoatPilotOrder(
  input: GoatPilotCreateOrderRequest,
) {
  const config = requirePilotRuntime();
  const amountWei = pilotAmountAtomic();
  const token = await resolveGoatPilotToken();
  const payer = input.payer_address.toLowerCase();
  const agentId = externalAgentId(payer);

  const requestContract = {
    contract_version: GOAT_PILOT_VERSION,
    sku: GOAT_PILOT_SKU,
    environment: config.environment,
    merchant_id: config.merchant_id,
    payer_address: payer,
    token_symbol: token.token_symbol,
    token_contract: token.token_contract,
    amount_wei: amountWei,
    risk_request: riskInputFromCreate(input),
  };
  const requestHash = sha256Text(canonicalJson(requestContract));

  const claim = await claimPilotRequest({
    externalAgentId: agentId,
    idempotencyKey: input.client_request_id,
    requestHash,
    environment: config.environment,
    merchantId: config.merchant_id,
    payer,
    tokenSymbol: token.token_symbol,
    tokenContract: token.token_contract,
    amountWei,
  });

  const pilot = await loadPilotRequestById(claim.requestId);
  await ensurePreparedResource(pilot.request_id, input);

  const fulfillment = await loadFulfillment(pilot.request_id);
  if (fulfillment) {
    return {
      http_status: 200 as const,
      body: await deliveredResponse(pilot, fulfillment),
    };
  }

  const bundle = await createOrLoadGoatOrder(pilot);
  const challenge = bundle.challenge.challenge;

  return {
    http_status: 402 as const,
    body: {
      ok: false as const,
      pilot_version: GOAT_PILOT_VERSION,
      sku: GOAT_PILOT_SKU,
      state: "PAYMENT_REQUIRED" as const,
      request_id: pilot.request_id,
      client_request_id: pilot.idempotency_key,
      environment: pilot.environment,
      payment_required: true as const,
      payment: {
        provider: "goat_flow_x402" as const,
        environment: pilot.environment,
        order_id: bundle.order.goat_order_id,
        dapp_order_id: bundle.order.dapp_order_id,
        chain_id: bundle.order.source_chain_id,
        network: `eip155:${bundle.order.source_chain_id}`,
        token_symbol: bundle.order.token_symbol,
        token_contract: bundle.order.token_contract,
        amount_atomic: bundle.order.amount_wei,
        pay_to: bundle.order.pay_to_address,
        expires_at: bundle.order.expires_at,
        flow: bundle.order.payment_flow,
        challenge,
        commercial_revenue: false,
        note:
          pilot.environment === "testnet3"
            ? "GOAT Testnet3 partner proof only. Pay with a test wallet; no testnet transaction is revenue."
            : "Production payment required. Geomacro never holds or signs with the buyer wallet.",
      },
      resource_prepared: true as const,
      resource_delivered: false as const,
      execution_authorized: false as const,
    },
  };
}

export async function reconcileGoatPilotOrder(
  input: GoatPilotStatusRequest,
) {
  const config = requirePilotRuntime();
  const pilot = await loadPilotRequestByIdentity(input);

  if (
    pilot.environment !== config.environment ||
    pilot.merchant_id !== config.merchant_id
  ) {
    throw new GoatPilotError(
      "GOAT_PILOT_ENVIRONMENT_MISMATCH",
      "Stored GOAT pilot request belongs to a different merchant/environment.",
      409,
      false,
    );
  }

  const fulfilled = await loadFulfillment(pilot.request_id);
  if (fulfilled) {
    return {
      http_status: 200 as const,
      body: await deliveredResponse(pilot, fulfilled),
    };
  }

  const bundle = await loadOrderBundle(pilot.request_id);
  if (!bundle) {
    const claim = await readCreationClaim(pilot.request_id);
    if (claim?.provider_creation_attempted_at) {
      throw new GoatPilotError(
        "GOAT_ORDER_RECONCILIATION_REQUIRED",
        "GOAT provider order creation was attempted but local order evidence is incomplete.",
        503,
        false,
      );
    }
    throw new GoatPilotError(
      "GOAT_ORDER_NOT_READY",
      "GOAT order has not been created yet.",
      409,
      true,
    );
  }

  let providerOrder: GoatFlowOrder;
  try {
    providerOrder = await getGoatFlowOrder(bundle.order.goat_order_id);
  } catch (error) {
    console.error("[goat-pilot] authenticated GOAT order reconciliation failed", error);
    throw new GoatPilotError(
      "GOAT_PROVIDER_STATUS_UNAVAILABLE",
      "GOAT payment status is temporarily unavailable. Do not submit another payment.",
      503,
      true,
    );
  }

  assertProviderOrderIdentity(providerOrder, pilot, bundle.order);

  if (!isGoatPaidStatus(providerOrder.status)) {
    await updateNonPaidProviderState(pilot.request_id, providerOrder);

    return {
      http_status: isGoatTerminalFailureStatus(providerOrder.status) ? 409 as const : 202 as const,
      body: {
        ok: false as const,
        pilot_version: GOAT_PILOT_VERSION,
        sku: GOAT_PILOT_SKU,
        state: isGoatTerminalFailureStatus(providerOrder.status)
          ? "PAYMENT_NOT_COMPLETED" as const
          : "PAYMENT_PENDING" as const,
        request_id: pilot.request_id,
        client_request_id: pilot.idempotency_key,
        environment: pilot.environment,
        order_status: providerOrder.status,
        payment_required: providerOrder.status === "CHECKOUT_VERIFIED",
        resource_delivered: false as const,
        instruction:
          isGoatTerminalFailureStatus(providerOrder.status)
            ? "This order cannot fulfill intelligence. Create a new client_request_id only if a new payment attempt is intended."
            : "Payment is not confirmed yet. Reconcile this same order before any additional transfer.",
        execution_authorized: false as const,
      },
    };
  }

  const verified = verifyGoatPaidOrder(providerOrder, {
    order_id: bundle.order.goat_order_id,
    dapp_order_id: bundle.order.dapp_order_id,
    from_address: pilot.payer_address,
    chain_id: GOAT_FLOW_ENVIRONMENTS[pilot.environment].chain_id,
    token_contract: pilot.token_contract,
    token_symbol: pilot.token_symbol,
    amount_wei: pilot.amount_wei,
  });

  if (!verified.tx_hash || !verified.confirmed_at || !TX_HASH_RE.test(verified.tx_hash)) {
    throw new GoatPilotError(
      "GOAT_CONFIRMED_PAYMENT_EVIDENCE_INCOMPLETE",
      "GOAT reports a paid state but required settlement evidence is incomplete.",
      503,
      true,
    );
  }

  const db = requireRiskSupabase();
  const { data: paymentId, error } = await db.rpc(
    "complete_agent_goat_pilot_fulfillment",
    {
      p_request_id: pilot.request_id,
      p_goat_order_id: verified.order_id,
      p_order_status: verified.status,
      p_tx_hash: verified.tx_hash,
      p_confirmed_at: verified.confirmed_at,
    },
  );

  if (error || typeof paymentId !== "string") {
    console.error("[goat-pilot] settlement verified but local fulfillment failed", error);
    throw new GoatPilotError(
      "GOAT_FULFILLMENT_PERSISTENCE_FAILED",
      "Payment is confirmed but delivery evidence could not be finalized. Retry status reconciliation; do not pay again.",
      503,
      true,
    );
  }

  const finalFulfillment = await loadFulfillment(pilot.request_id);
  if (!finalFulfillment || finalFulfillment.payment_id !== paymentId) {
    throw new GoatPilotError(
      "GOAT_FULFILLMENT_EVIDENCE_INVALID",
      "Payment fulfillment evidence could not be verified after persistence.",
      503,
      true,
    );
  }

  return {
    http_status: 200 as const,
    body: await deliveredResponse(pilot, finalFulfillment),
  };
}
