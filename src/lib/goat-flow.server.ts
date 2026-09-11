import {
  createHmac,
  randomUUID,
} from "node:crypto";

export const GOAT_FLOW_ENVIRONMENTS = {
  testnet3: {
    chain_id: 48816,
    caip2: "eip155:48816",
    api_url: "https://flow-api.testnet3.goat.network",
    rpc_url: "https://rpc.testnet3.goat.network",
    commercial_revenue: false,
  },
  mainnet: {
    chain_id: 2345,
    caip2: "eip155:2345",
    api_url: "https://flow-api.goat.network",
    rpc_url: "https://rpc.goat.network",
    commercial_revenue: true,
  },
} as const;

export type GoatFlowEnvironment = keyof typeof GOAT_FLOW_ENVIRONMENTS;

export type GoatFlowOrderStatus =
  | "CHECKOUT_VERIFIED"
  | "PAYMENT_CONFIRMED"
  | "INVOICED"
  | "FAILED"
  | "EXPIRED"
  | "CANCELLED";

export type GoatFlowMerchantToken = {
  chain_id: number;
  token_symbol: string;
  token_contract: string;
};

export type GoatFlowMerchant = {
  merchant_id: string;
  receive_type: "DIRECT";
  supported_tokens: GoatFlowMerchantToken[];
};

export type GoatFlowCreateOrderInput = {
  dapp_order_id: string;
  from_address: string;
  amount_wei: string;
  token_symbol: string;
  token_contract: string;
};

export type GoatFlowPaymentChallenge = {
  x402_version: 2;
  order_id: string;
  dapp_order_id: string;
  flow: "ERC20_DIRECT";
  token_symbol: string;
  token_contract: string;
  pay_to: string;
  from_address: string;
  chain_id: number;
  destination_chain_id: number;
  amount_wei: string;
  expires_at: number;
};

export type GoatFlowOrder = {
  order_id: string;
  merchant_id: string;
  dapp_order_id: string;
  chain_id: number;
  token_contract: string;
  token_symbol: string;
  from_address: string;
  amount_wei: string;
  status: GoatFlowOrderStatus;
  tx_hash: string | null;
  confirmed_at: string | null;
};

type GoatFlowConfig = {
  environment: GoatFlowEnvironment;
  api_url: string;
  api_key: string;
  api_secret: string;
  merchant_id: string;
};

type SignedBody = Record<string, string | number>;

const REQUEST_TIMEOUT_MS = 30_000;
const MAX_RESPONSE_BYTES = 128 * 1024;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const SAFE_TOKEN_SYMBOL = /^[A-Z0-9][A-Z0-9._-]{1,15}$/;
const EVM_ADDRESS = /^0x[a-fA-F0-9]{40}$/;
const TX_HASH = /^0x[a-fA-F0-9]{64}$/;
const INTEGER_STRING = /^(0|[1-9][0-9]{0,77})$/;
const SAFE_SIGNED_SCALAR = /^[^&=\u0000-\u001F\u007F]{1,512}$/;
const KNOWN_STATUSES = new Set<GoatFlowOrderStatus>([
  "CHECKOUT_VERIFIED",
  "PAYMENT_CONFIRMED",
  "INVOICED",
  "FAILED",
  "EXPIRED",
  "CANCELLED",
]);
const SUCCESS_STATUSES = new Set<GoatFlowOrderStatus>([
  "PAYMENT_CONFIRMED",
  "INVOICED",
]);
const FAILURE_STATUSES = new Set<GoatFlowOrderStatus>([
  "FAILED",
  "EXPIRED",
  "CANCELLED",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function requiredEnv(name: string, maxLength = 4096): string {
  const value = process.env[name]?.trim();
  if (!value || value.length > maxLength) {
    throw new Error(`${name} is not configured`);
  }
  return value;
}

function safeId(value: string, field: string): string {
  const normalized = value.trim();
  if (!SAFE_ID.test(normalized)) {
    throw new Error(`${field} is invalid`);
  }
  return normalized;
}

function safeSignedScalar(value: string, field: string): string {
  if (!SAFE_SIGNED_SCALAR.test(value)) {
    throw new Error(`${field} contains unsupported HMAC delimiter/control characters`);
  }
  return value;
}

export function goatFlowEnvironment(): GoatFlowEnvironment | null {
  const value = process.env.GOATX402_ENVIRONMENT?.trim().toLowerCase();
  return value === "testnet3" || value === "mainnet" ? value : null;
}

export function requireGoatFlowConfig(): GoatFlowConfig {
  const environment = goatFlowEnvironment();
  if (!environment) {
    throw new Error("GOATX402_ENVIRONMENT must be testnet3 or mainnet");
  }

  const expected = GOAT_FLOW_ENVIRONMENTS[environment];
  const configuredApi = process.env.GOATX402_API_URL?.trim() || expected.api_url;

  let parsed: URL;
  try {
    parsed = new URL(configuredApi);
  } catch {
    throw new Error("GOATX402_API_URL is invalid");
  }

  if (
    parsed.protocol !== "https:" ||
    parsed.origin !== expected.api_url ||
    parsed.pathname !== "/" ||
    parsed.search ||
    parsed.hash
  ) {
    throw new Error("GOATX402_API_URL must match the official selected GOAT Flow origin");
  }

  const apiKey = requiredEnv("GOATX402_API_KEY", 512);
  const apiSecret = requiredEnv("GOATX402_API_SECRET", 2048);
  const merchantId = safeId(requiredEnv("GOATX402_MERCHANT_ID", 128), "GOATX402_MERCHANT_ID");

  if (/[\u0000-\u001F\u007F]/.test(apiKey) || /[\u0000-\u001F\u007F]/.test(apiSecret)) {
    throw new Error("GOAT Flow credentials contain invalid control characters");
  }

  return {
    environment,
    api_url: expected.api_url,
    api_key: apiKey,
    api_secret: apiSecret,
    merchant_id: merchantId,
  };
}

export function isGoatFlowConfigured(): boolean {
  try {
    requireGoatFlowConfig();
    return true;
  } catch {
    return false;
  }
}

export function validateGoatCreateOrderInput(
  input: GoatFlowCreateOrderInput,
  environment: GoatFlowEnvironment,
): GoatFlowCreateOrderInput & { chain_id: number } {
  const dappOrderId = safeId(input.dapp_order_id, "dapp_order_id");
  safeSignedScalar(dappOrderId, "dapp_order_id");

  const payer = input.from_address.trim().toLowerCase();
  if (!EVM_ADDRESS.test(payer)) {
    throw new Error("GOAT payer address is invalid");
  }

  const amount = input.amount_wei.trim();
  if (!INTEGER_STRING.test(amount) || BigInt(amount) <= 0n) {
    throw new Error("GOAT amount_wei must be a positive bounded integer string");
  }

  const symbol = input.token_symbol.trim().toUpperCase();
  if (!SAFE_TOKEN_SYMBOL.test(symbol)) {
    throw new Error("GOAT token_symbol is invalid");
  }
  safeSignedScalar(symbol, "token_symbol");

  const contract = input.token_contract.trim().toLowerCase();
  if (!EVM_ADDRESS.test(contract)) {
    throw new Error("GOAT token_contract is invalid");
  }

  return {
    dapp_order_id: dappOrderId,
    from_address: payer,
    amount_wei: amount,
    token_symbol: symbol,
    token_contract: contract,
    chain_id: GOAT_FLOW_ENVIRONMENTS[environment].chain_id,
  };
}

function stringifiedSignedBody(body: SignedBody): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, raw] of Object.entries(body)) {
    result[key] = safeSignedScalar(String(raw), key);
  }
  return result;
}

export function calculateGoatFlowSignature(
  params: Record<string, string>,
  apiSecret: string,
): string {
  const filtered = { ...params };
  delete filtered.sign;
  const signString = Object.keys(filtered)
    .filter((key) => filtered[key] !== "")
    .sort()
    .map((key) => `${key}=${filtered[key]}`)
    .join("&");

  return createHmac("sha256", apiSecret).update(signString).digest("hex");
}

export function signGoatFlowRequest(
  body: SignedBody,
  config: Pick<GoatFlowConfig, "api_key" | "api_secret">,
  nowSeconds = Math.floor(Date.now() / 1000),
  nonce = randomUUID(),
) {
  // The API key is a server-controlled GOAT credential, not a user-supplied
  // signed body scalar. Provider-generated keys may legitimately contain
  // delimiter characters, so only the credential control-character checks in
  // requireGoatFlowConfig() apply here. User-controlled/body scalars remain
  // delimiter-restricted below.
  safeSignedScalar(String(nowSeconds), "timestamp");
  safeSignedScalar(nonce, "nonce");

  const params = {
    ...stringifiedSignedBody(body),
    api_key: config.api_key,
    timestamp: String(nowSeconds),
    nonce,
  };

  return {
    "X-API-Key": config.api_key,
    "X-Timestamp": String(nowSeconds),
    "X-Nonce": nonce,
    "X-Sign": calculateGoatFlowSignature(params, config.api_secret),
  } as const;
}

async function boundedJsonResponse(response: Response): Promise<Record<string, unknown>> {
  const contentLength = response.headers.get("content-length");
  if (contentLength && Number(contentLength) > MAX_RESPONSE_BYTES) {
    throw new Error("GOAT Flow response is too large");
  }

  const text = await response.text();
  if (Buffer.byteLength(text, "utf8") > MAX_RESPONSE_BYTES) {
    throw new Error("GOAT Flow response is too large");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`GOAT Flow returned non-JSON status ${response.status}`);
  }

  if (!isRecord(parsed)) {
    throw new Error("GOAT Flow returned an invalid JSON object");
  }
  return parsed;
}

async function authenticatedRequest(
  method: "GET" | "POST",
  path: string,
  body: SignedBody | null,
  options?: { expect_402?: boolean; timeout_ms?: number },
): Promise<{ status: number; body: Record<string, unknown> }> {
  const config = requireGoatFlowConfig();
  const headers = signGoatFlowRequest(body ?? {}, config);

  const response = await fetch(`${config.api_url}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    body: body === null ? undefined : JSON.stringify(body),
    redirect: "manual",
    signal: AbortSignal.timeout(
      Math.min(REQUEST_TIMEOUT_MS, Math.max(1, options?.timeout_ms ?? REQUEST_TIMEOUT_MS)),
    ),
  });

  if (response.status >= 300 && response.status < 400) {
    throw new Error("GOAT Flow redirect rejected");
  }

  const parsed = await boundedJsonResponse(response);
  const expected402 = response.status === 402 && options?.expect_402 === true;
  if (!response.ok && !expected402) {
    const code = typeof parsed.code === "string" ? parsed.code : "GOAT_FLOW_ERROR";
    throw new Error(`${code}: GOAT Flow request failed with status ${response.status}`);
  }

  return { status: response.status, body: parsed };
}

async function publicRequest(path: string): Promise<Record<string, unknown>> {
  const config = requireGoatFlowConfig();
  const response = await fetch(`${config.api_url}${path}`, {
    method: "GET",
    redirect: "manual",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (response.status >= 300 && response.status < 400) {
    throw new Error("GOAT Flow redirect rejected");
  }

  const parsed = await boundedJsonResponse(response);
  if (!response.ok) {
    throw new Error(`GOAT Flow public request failed with status ${response.status}`);
  }
  return parsed;
}

function requiredString(
  record: Record<string, unknown>,
  key: string,
  maxLength = 512,
): string {
  const value = record[key];
  if (typeof value !== "string" || !value.trim() || value.length > maxLength) {
    throw new Error(`GOAT Flow response field ${key} is invalid`);
  }
  return value.trim();
}

function requiredInteger(record: Record<string, unknown>, key: string): number {
  const value = record[key];
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`GOAT Flow response field ${key} is invalid`);
  }
  return value;
}

function parseCaip2ChainId(value: unknown): number {
  if (typeof value !== "string") throw new Error("GOAT x402 network is missing");
  const match = value.match(/^eip155:([1-9][0-9]{0,14})$/);
  if (!match) throw new Error("GOAT x402 network is invalid");
  const chainId = Number(match[1]);
  if (!Number.isSafeInteger(chainId)) throw new Error("GOAT x402 network exceeds safe integer range");
  return chainId;
}

export async function getGoatFlowMerchant(): Promise<GoatFlowMerchant> {
  const config = requireGoatFlowConfig();
  const raw = await publicRequest(`/merchants/${encodeURIComponent(config.merchant_id)}`);
  const merchantId = requiredString(raw, "merchant_id", 128);
  if (merchantId !== config.merchant_id) {
    throw new Error("GOAT merchant identity mismatch");
  }
  if (raw.receive_type !== "DIRECT") {
    throw new Error("GOAT partner pilot requires a DIRECT merchant");
  }
  if (!Array.isArray(raw.wallets)) {
    throw new Error("GOAT merchant wallets are unavailable");
  }

  const supportedTokens = raw.wallets.map((item, index): GoatFlowMerchantToken => {
    if (!isRecord(item)) throw new Error(`GOAT merchant wallet ${index} is invalid`);
    const chainId = requiredInteger(item, "chain_id");
    const tokenSymbol = requiredString(item, "token_symbol", 32).toUpperCase();
    const tokenContract = requiredString(item, "token_contract", 64).toLowerCase();
    if (!SAFE_TOKEN_SYMBOL.test(tokenSymbol) || !EVM_ADDRESS.test(tokenContract)) {
      throw new Error(`GOAT merchant wallet ${index} token contract is invalid`);
    }
    return { chain_id: chainId, token_symbol: tokenSymbol, token_contract: tokenContract };
  });

  return {
    merchant_id: merchantId,
    receive_type: "DIRECT",
    supported_tokens: supportedTokens,
  };
}

export async function resolveGoatPilotToken(
  tokenSymbol = process.env.GOATX402_PILOT_TOKEN_SYMBOL?.trim().toUpperCase() || "USDC",
): Promise<GoatFlowMerchantToken> {
  if (!SAFE_TOKEN_SYMBOL.test(tokenSymbol)) {
    throw new Error("GOATX402_PILOT_TOKEN_SYMBOL is invalid");
  }
  const config = requireGoatFlowConfig();
  const merchant = await getGoatFlowMerchant();
  const matches = merchant.supported_tokens.filter(
    (token) => token.chain_id === GOAT_FLOW_ENVIRONMENTS[config.environment].chain_id && token.token_symbol === tokenSymbol,
  );
  if (matches.length !== 1) {
    throw new Error(`GOAT merchant must expose exactly one ${tokenSymbol} token on the selected environment`);
  }
  return matches[0];
}

function validateCreatedChallenge(
  raw: Record<string, unknown>,
  input: ReturnType<typeof validateGoatCreateOrderInput>,
): GoatFlowPaymentChallenge {
  if (raw.x402Version !== 2) throw new Error("GOAT Flow returned unsupported x402 version");
  if (!Array.isArray(raw.accepts) || raw.accepts.length !== 1 || !isRecord(raw.accepts[0])) {
    throw new Error("GOAT Flow payment challenge must contain exactly one payment option for this pilot");
  }

  const option = raw.accepts[0];
  const orderId = safeId(requiredString(raw, "order_id", 256), "GOAT order_id");
  const extra = isRecord(option.extra) ? option.extra : {};
  const flow = typeof raw.flow === "string" ? raw.flow : typeof extra.flow === "string" ? extra.flow : "";
  if (flow !== "ERC20_DIRECT") throw new Error("GOAT partner pilot supports ERC20_DIRECT only");

  const chainId = parseCaip2ChainId(option.network);
  if (chainId !== input.chain_id) throw new Error("GOAT payment challenge chain mismatch");

  const tokenContract = typeof option.asset === "string" ? option.asset.trim().toLowerCase() : "";
  if (!EVM_ADDRESS.test(tokenContract) || tokenContract !== input.token_contract) {
    throw new Error("GOAT payment challenge token contract mismatch");
  }

  const payTo = typeof option.payTo === "string" ? option.payTo.trim().toLowerCase() : "";
  if (!EVM_ADDRESS.test(payTo)) throw new Error("GOAT payment challenge payTo address is invalid");

  const amount = typeof option.amount === "string" ? option.amount.trim() : "";
  if (amount !== input.amount_wei) throw new Error("GOAT payment challenge amount mismatch");

  const tokenSymbol =
    typeof raw.token_symbol === "string"
      ? raw.token_symbol.trim().toUpperCase()
      : typeof extra.tokenSymbol === "string"
        ? extra.tokenSymbol.trim().toUpperCase()
        : "";
  if (tokenSymbol !== input.token_symbol) throw new Error("GOAT payment challenge token symbol mismatch");

  const extensions = isRecord(raw.extensions) ? raw.extensions : {};
  const goatExtension = isRecord(extensions.goatx402) ? extensions.goatx402 : {};
  const destinationChainId = parseCaip2ChainId(goatExtension.destinationChain);
  if (destinationChainId !== input.chain_id) {
    throw new Error("GOAT payment challenge destination-chain mismatch");
  }

  const expiresAt = goatExtension.expiresAt;
  if (
    typeof expiresAt !== "number" ||
    !Number.isSafeInteger(expiresAt) ||
    expiresAt <= Math.floor(Date.now() / 1000)
  ) {
    throw new Error("GOAT payment challenge expiry is invalid or expired");
  }

  return {
    x402_version: 2,
    order_id: orderId,
    dapp_order_id: input.dapp_order_id,
    flow: "ERC20_DIRECT",
    token_symbol: tokenSymbol,
    token_contract: tokenContract,
    pay_to: payTo,
    from_address: input.from_address,
    chain_id: chainId,
    destination_chain_id: destinationChainId,
    amount_wei: amount,
    expires_at: expiresAt,
  };
}

export async function createGoatFlowOrder(
  input: GoatFlowCreateOrderInput,
): Promise<GoatFlowPaymentChallenge> {
  const config = requireGoatFlowConfig();
  const validated = validateGoatCreateOrderInput(input, config.environment);
  const body: SignedBody = {
    dapp_order_id: validated.dapp_order_id,
    chain_id: validated.chain_id,
    token_symbol: validated.token_symbol,
    token_contract: validated.token_contract,
    from_address: validated.from_address,
    amount_wei: validated.amount_wei,
  };

  const result = await authenticatedRequest("POST", "/api/v1/orders", body, { expect_402: true });
  if (result.status !== 402) {
    throw new Error("GOAT Flow create-order did not return the expected HTTP 402 challenge");
  }
  return validateCreatedChallenge(result.body, validated);
}

function parseGoatOrder(raw: Record<string, unknown>): GoatFlowOrder {
  const statusRaw = requiredString(raw, "status", 64);
  if (!KNOWN_STATUSES.has(statusRaw as GoatFlowOrderStatus)) {
    throw new Error(`GOAT Flow returned unsupported order status ${statusRaw}`);
  }

  const orderId = safeId(requiredString(raw, "order_id", 256), "GOAT order_id");
  const merchantId = safeId(requiredString(raw, "merchant_id", 128), "GOAT merchant_id");
  const dappOrderId = safeId(requiredString(raw, "dapp_order_id", 128), "GOAT dapp_order_id");
  const chainId = requiredInteger(raw, "chain_id");
  const tokenContract = requiredString(raw, "token_contract", 64).toLowerCase();
  const tokenSymbol = requiredString(raw, "token_symbol", 32).toUpperCase();
  const fromAddress = requiredString(raw, "from_address", 64).toLowerCase();
  const amountWei = requiredString(raw, "amount_wei", 80);

  if (!EVM_ADDRESS.test(tokenContract) || !EVM_ADDRESS.test(fromAddress)) {
    throw new Error("GOAT Flow order contains an invalid EVM address");
  }
  if (!SAFE_TOKEN_SYMBOL.test(tokenSymbol) || !INTEGER_STRING.test(amountWei)) {
    throw new Error("GOAT Flow order contains invalid token/amount fields");
  }

  const txHashRaw = raw.tx_hash;
  const txHash = txHashRaw === null || txHashRaw === undefined || txHashRaw === ""
    ? null
    : typeof txHashRaw === "string" && TX_HASH.test(txHashRaw)
      ? txHashRaw.toLowerCase()
      : (() => { throw new Error("GOAT Flow order tx_hash is invalid"); })();

  const confirmedAtRaw = raw.confirmed_at;
  const confirmedAt = confirmedAtRaw === null || confirmedAtRaw === undefined || confirmedAtRaw === ""
    ? null
    : typeof confirmedAtRaw === "string" && Number.isFinite(Date.parse(confirmedAtRaw))
      ? new Date(confirmedAtRaw).toISOString()
      : (() => { throw new Error("GOAT Flow order confirmed_at is invalid"); })();

  return {
    order_id: orderId,
    merchant_id: merchantId,
    dapp_order_id: dappOrderId,
    chain_id: chainId,
    token_contract: tokenContract,
    token_symbol: tokenSymbol,
    from_address: fromAddress,
    amount_wei: amountWei,
    status: statusRaw as GoatFlowOrderStatus,
    tx_hash: txHash,
    confirmed_at: confirmedAt,
  };
}

export async function getGoatFlowOrder(orderId: string): Promise<GoatFlowOrder> {
  const safeOrderId = safeId(orderId, "GOAT order_id");
  const result = await authenticatedRequest(
    "GET",
    `/api/v1/orders/${encodeURIComponent(safeOrderId)}`,
    null,
  );
  return parseGoatOrder(result.body);
}

export function isGoatPaidStatus(status: GoatFlowOrderStatus): boolean {
  return SUCCESS_STATUSES.has(status);
}

export function isGoatTerminalFailureStatus(status: GoatFlowOrderStatus): boolean {
  return FAILURE_STATUSES.has(status);
}

export function verifyGoatPaidOrder(
  order: GoatFlowOrder,
  expected: {
    order_id: string;
    dapp_order_id: string;
    from_address: string;
    chain_id: number;
    token_contract: string;
    token_symbol: string;
    amount_wei: string;
  },
): GoatFlowOrder {
  if (!isGoatPaidStatus(order.status)) {
    throw new Error(`GOAT order is not paid: ${order.status}`);
  }
  if (order.order_id !== expected.order_id) throw new Error("GOAT paid order ID mismatch");
  if (order.dapp_order_id !== expected.dapp_order_id) throw new Error("GOAT paid dapp_order_id mismatch");
  if (order.from_address !== expected.from_address.toLowerCase()) throw new Error("GOAT paid payer mismatch");
  if (order.chain_id !== expected.chain_id) throw new Error("GOAT paid chain mismatch");
  if (order.token_contract !== expected.token_contract.toLowerCase()) throw new Error("GOAT paid token contract mismatch");
  if (order.token_symbol !== expected.token_symbol.toUpperCase()) throw new Error("GOAT paid token symbol mismatch");
  if (order.amount_wei !== expected.amount_wei) throw new Error("GOAT paid amount mismatch");
  if (!order.tx_hash) throw new Error("GOAT paid order has no transaction hash");
  if (!order.confirmed_at) throw new Error("GOAT paid order has no confirmation timestamp");
  return order;
}

export async function waitForGoatPaidOrder(
  expected: Parameters<typeof verifyGoatPaidOrder>[1],
  options?: { timeout_ms?: number; interval_ms?: number },
): Promise<GoatFlowOrder> {
  const timeoutMs = Math.min(Math.max(options?.timeout_ms ?? 5 * 60_000, 1_000), 10 * 60_000);
  const intervalMs = Math.min(Math.max(options?.interval_ms ?? 3_000, 500), 30_000);
  const started = Date.now();

  while (Date.now() - started < timeoutMs) {
    const order = await getGoatFlowOrder(expected.order_id);
    if (isGoatPaidStatus(order.status)) return verifyGoatPaidOrder(order, expected);
    if (isGoatTerminalFailureStatus(order.status)) {
      throw new Error(`GOAT order ended without payment: ${order.status}`);
    }
    await new Promise((resolve) => setTimeout(resolve, Math.min(intervalMs, timeoutMs - (Date.now() - started))));
  }

  throw new Error("GOAT order confirmation timed out; reconcile before creating another payment");
}
