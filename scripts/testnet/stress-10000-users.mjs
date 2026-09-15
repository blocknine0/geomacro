import { performance } from "node:perf_hooks";

const USERS = Number(process.env.TESTNET_STRESS_USERS || 10_000);
const REQUESTS_PER_USER = Number(process.env.TESTNET_STRESS_REQUESTS_PER_USER || 25);
const QUOTA = 500;
const ATOMIC_PER_CREDIT = 500_000n;
const CHAIN_ID = "84532";

const CAPABILITIES = [
  ["intelligence_query", 1],
  ["gri_read", 1],
  ["structural_country_digest", 3],
  ["structural_corridor_digest", 5],
  ["structural_country_profile", 8],
  ["structural_corridor_profile", 12],
  ["signed_risk_object", 10],
  ["risk_gate_bundle", 15],
];

if (!Number.isInteger(USERS) || USERS < 1 || USERS > 100_000) {
  throw new Error("TESTNET_STRESS_USERS must be an integer between 1 and 100000");
}
if (!Number.isInteger(REQUESTS_PER_USER) || REQUESTS_PER_USER < 1 || REQUESTS_PER_USER > 100) {
  throw new Error("TESTNET_STRESS_REQUESTS_PER_USER must be an integer between 1 and 100");
}

const walletOwners = new Map();
const accounts = new Map();
const requestClaims = new Map();
const txClaims = new Map();
const paymentEvents = new Map();

let quotesIssued = 0;
let primaryPaidCalls = 0;
let exactReplays = 0;
let idempotencyConflicts = 0;
let reusedTxBlocked = 0;
let underpaymentsBlocked = 0;
let wrongWalletBlocked = 0;
let duplicateWalletBlocked = 0;
let insufficientCreditsBlocked = 0;
let paymentQuotesAfterInsufficientCapacity = 0;
let reconciliationFailuresInjected = 0;
let reconciliationRecoveries = 0;
let finalizationFailuresInjected = 0;
let finalizationRecoveries = 0;
let doubleCreditEvents = 0;
let doublePaymentEvents = 0;
let unexpectedFailures = 0;

function accountFor(userId) {
  return accounts.get(userId);
}

function registerWallet(userId, walletHash) {
  const existing = walletOwners.get(walletHash);
  if (existing && existing !== userId) {
    duplicateWalletBlocked += 1;
    return { ok: false, code: "WALLET_ALREADY_USED" };
  }
  if (!existing) walletOwners.set(walletHash, userId);
  if (!accounts.has(userId)) {
    accounts.set(userId, {
      walletHash,
      included: QUOTA,
      used: 0,
      usage: new Map(),
    });
  }
  return { ok: true };
}

function requiredAtomic(cost) {
  return BigInt(cost) * ATOMIC_PER_CREDIT;
}

function requestKey(userId, requestId) {
  return `${userId}:${requestId}`;
}

function txKey(txHash) {
  return `${CHAIN_ID}:${txHash}`;
}

function preflightCapacity(account, capability, cost, requestId) {
  const existingUsage = account.usage.get(requestId);
  if (existingUsage) {
    if (existingUsage.capability !== capability || existingUsage.cost !== cost) {
      return { ok: false, code: "TESTNET_REQUEST_IDEMPOTENCY_CONFLICT" };
    }
    return { ok: true, replay: true };
  }
  if (account.used + cost > account.included) {
    return { ok: false, code: "INSUFFICIENT_CREDITS" };
  }
  return { ok: true, replay: false };
}

function quoteCall({ userId, requestId, capability, cost }) {
  const account = accountFor(userId);
  if (!account) return { ok: false, code: "ACCOUNT_NOT_FOUND" };
  const capacity = preflightCapacity(account, capability, cost, requestId);
  if (!capacity.ok) {
    if (capacity.code === "INSUFFICIENT_CREDITS") insufficientCreditsBlocked += 1;
    return capacity;
  }
  quotesIssued += 1;
  return {
    ok: false,
    code: "TESTNET_PAYMENT_REQUIRED",
    amount_due_atomic: requiredAtomic(cost),
  };
}

function settleCall({
  userId,
  walletHash,
  requestId,
  capability,
  cost,
  txHash,
  amountAtomic,
  injectReconciliationFailure = false,
  injectFinalizationFailure = false,
}) {
  const account = accountFor(userId);
  if (!account) return { ok: false, code: "ACCOUNT_NOT_FOUND" };
  if (account.walletHash !== walletHash) {
    wrongWalletBlocked += 1;
    return { ok: false, code: "TESTNET_PAYER_WALLET_MISMATCH" };
  }

  const capacity = preflightCapacity(account, capability, cost, requestId);
  if (!capacity.ok) {
    if (capacity.code === "INSUFFICIENT_CREDITS") insufficientCreditsBlocked += 1;
    else idempotencyConflicts += 1;
    return capacity;
  }

  if (amountAtomic < requiredAtomic(cost)) {
    underpaymentsBlocked += 1;
    return { ok: false, code: "TESTNET_UNDERPAYMENT" };
  }

  const rKey = requestKey(userId, requestId);
  const tKey = txKey(txHash);
  const existingRequestClaim = requestClaims.get(rKey);
  if (existingRequestClaim) {
    if (
      existingRequestClaim.txKey !== tKey ||
      existingRequestClaim.capability !== capability ||
      existingRequestClaim.cost !== cost
    ) {
      idempotencyConflicts += 1;
      return { ok: false, code: "TESTNET_PAYMENT_IDEMPOTENCY_CONFLICT" };
    }
  } else {
    const existingTxClaim = txClaims.get(tKey);
    if (existingTxClaim) {
      reusedTxBlocked += 1;
      return { ok: false, code: "TESTNET_PAYMENT_ALREADY_CLAIMED" };
    }
    const claim = {
      userId,
      requestId,
      capability,
      cost,
      txKey: tKey,
      verificationStatus: "pending",
      paymentEventId: null,
    };
    requestClaims.set(rKey, claim);
    txClaims.set(tKey, claim);
  }

  let usage = account.usage.get(requestId);
  const usedBefore = account.used;
  if (!usage) {
    account.used += cost;
    usage = { capability, cost };
    account.usage.set(requestId, usage);
  } else if (usage.capability !== capability || usage.cost !== cost) {
    idempotencyConflicts += 1;
    return { ok: false, code: "IDEMPOTENCY_CONFLICT" };
  }
  const idempotentReplay = usedBefore === account.used;
  if (idempotentReplay && capacity.replay !== true) doubleCreditEvents += 1;

  const claim = requestClaims.get(rKey);
  if (!claim) throw new Error(`claim disappeared for ${rKey}`);

  if (!paymentEvents.has(tKey)) {
    if (injectReconciliationFailure) {
      reconciliationFailuresInjected += 1;
      return {
        ok: false,
        code: "TESTNET_PAYMENT_RECONCILIATION_FAILED",
        retryable_same_request: true,
        idempotent_credit_state: true,
      };
    }
    const paymentEventId = `payment-${paymentEvents.size + 1}`;
    paymentEvents.set(tKey, {
      id: paymentEventId,
      userId,
      requestId,
      txKey: tKey,
      commercialRevenue: false,
    });
    claim.paymentEventId = paymentEventId;
  } else {
    const event = paymentEvents.get(tKey);
    if (event.userId !== userId || event.requestId !== requestId) {
      doublePaymentEvents += 1;
      return { ok: false, code: "TESTNET_PAYMENT_RECONCILIATION_CONFLICT" };
    }
    claim.paymentEventId = event.id;
  }

  if (injectFinalizationFailure && claim.verificationStatus !== "verified") {
    finalizationFailuresInjected += 1;
    return {
      ok: false,
      code: "TESTNET_PAYMENT_FINALIZATION_FAILED",
      retryable_same_request: true,
      idempotent_credit_state: true,
    };
  }

  claim.verificationStatus = "verified";
  return {
    ok: true,
    idempotent_replay: capacity.replay === true,
    credits_remaining: account.included - account.used,
    payment_event_id: claim.paymentEventId,
  };
}

function assertExactReplay(input, firstResult) {
  const account = accountFor(input.userId);
  const usedBefore = account.used;
  const eventsBefore = paymentEvents.size;
  const claimsBefore = txClaims.size;
  const replay = settleCall(input);
  if (
    !replay.ok ||
    !replay.idempotent_replay ||
    replay.payment_event_id !== firstResult.payment_event_id ||
    account.used !== usedBefore ||
    paymentEvents.size !== eventsBefore ||
    txClaims.size !== claimsBefore
  ) {
    doubleCreditEvents += 1;
    return;
  }
  exactReplays += 1;
}

const started = performance.now();

for (let i = 0; i < USERS; i += 1) {
  const userId = `user-${i}`;
  const walletHash = `wallet-${i}`;
  const registration = registerWallet(userId, walletHash);
  if (!registration.ok) throw new Error(`registration failed for ${userId}`);

  for (let j = 0; j < REQUESTS_PER_USER; j += 1) {
    const [capability, cost] = CAPABILITIES[(i + j) % CAPABILITIES.length];
    const requestId = `req-${i}-${j}`;
    const txHash = `tx-${i}-${j}`;

    const quote = quoteCall({ userId, requestId, capability, cost });
    if (quote.code !== "TESTNET_PAYMENT_REQUIRED" || quote.amount_due_atomic !== requiredAtomic(cost)) {
      unexpectedFailures += 1;
      continue;
    }

    const input = {
      userId,
      walletHash,
      requestId,
      capability,
      cost,
      txHash,
      amountAtomic: requiredAtomic(cost),
    };

    const injectReconciliationFailure = j === 0 && i < Math.min(USERS, 1000);
    const injectFinalizationFailure = j === 1 && i < Math.min(USERS, 1000);
    let first = settleCall({
      ...input,
      injectReconciliationFailure,
      injectFinalizationFailure,
    });

    if (!first.ok && first.retryable_same_request) {
      const usedAfterFailure = accountFor(userId).used;
      const claimsAfterFailure = txClaims.size;
      const eventsAfterFailure = paymentEvents.size;
      first = settleCall(input);
      if (!first.ok || accountFor(userId).used !== usedAfterFailure || txClaims.size !== claimsAfterFailure) {
        doubleCreditEvents += 1;
        continue;
      }
      if (injectReconciliationFailure) {
        if (paymentEvents.size !== eventsAfterFailure + 1) doublePaymentEvents += 1;
        reconciliationRecoveries += 1;
      }
      if (injectFinalizationFailure) {
        if (paymentEvents.size !== eventsAfterFailure) doublePaymentEvents += 1;
        finalizationRecoveries += 1;
      }
    }

    if (!first.ok) {
      unexpectedFailures += 1;
      continue;
    }
    primaryPaidCalls += 1;

    if (j % 5 === 0) {
      assertExactReplay(input, first);
    }

    if (j % 10 === 0) {
      const account = accountFor(userId);
      const claimsBefore = txClaims.size;
      const usedBefore = account.used;
      const [mutatedCapability, mutatedCost] = CAPABILITIES[(i + j + 1) % CAPABILITIES.length];
      const mutated = settleCall({
        ...input,
        capability: mutatedCapability,
        cost: mutatedCost,
        txHash: `mutated-${txHash}`,
        amountAtomic: requiredAtomic(mutatedCost),
      });
      if (mutated.ok || txClaims.size !== claimsBefore || account.used !== usedBefore) {
        unexpectedFailures += 1;
      }
    }
  }

  if (REQUESTS_PER_USER > 0) {
    const [capability, cost] = CAPABILITIES[i % CAPABILITIES.length];
    const reused = settleCall({
      userId,
      walletHash,
      requestId: `reused-tx-${i}`,
      capability,
      cost,
      txHash: `tx-${i}-0`,
      amountAtomic: requiredAtomic(cost),
    });
    if (reused.ok) unexpectedFailures += 1;
  }

  if (i < Math.min(USERS, 1000)) {
    const [capability, cost] = CAPABILITIES[(i + 2) % CAPABILITIES.length];
    const account = accountFor(userId);
    const usedBefore = account.used;
    const claimsBefore = txClaims.size;
    const underpaid = settleCall({
      userId,
      walletHash,
      requestId: `underpaid-${i}`,
      capability,
      cost,
      txHash: `underpaid-tx-${i}`,
      amountAtomic: requiredAtomic(cost) - 1n,
    });
    if (underpaid.ok || account.used !== usedBefore || txClaims.size !== claimsBefore) {
      unexpectedFailures += 1;
    }

    const wrongWallet = settleCall({
      userId,
      walletHash: `wrong-wallet-${i}`,
      requestId: `wrong-wallet-${i}`,
      capability,
      cost,
      txHash: `wrong-wallet-tx-${i}`,
      amountAtomic: requiredAtomic(cost),
    });
    if (wrongWallet.ok || account.used !== usedBefore || txClaims.size !== claimsBefore) {
      unexpectedFailures += 1;
    }
  }
}

for (let i = 0; i < Math.min(USERS, 1000); i += 1) {
  const duplicate = registerWallet(`duplicate-wallet-user-${i}`, `wallet-${i}`);
  if (duplicate.ok) unexpectedFailures += 1;
}

// Exhaust a bounded sample using only a real 15-credit capability, then ensure
// capacity fails before a new 402 payment quote can be issued.
for (let i = 0; i < Math.min(USERS, 250); i += 1) {
  const userId = `user-${i}`;
  const walletHash = `wallet-${i}`;
  const account = accountFor(userId);
  let n = 0;
  while (account.used + 15 <= account.included) {
    const requestId = `capacity-fill-${i}-${n}`;
    const txHash = `capacity-fill-tx-${i}-${n}`;
    const quote = quoteCall({ userId, requestId, capability: "risk_gate_bundle", cost: 15 });
    if (quote.code !== "TESTNET_PAYMENT_REQUIRED") {
      unexpectedFailures += 1;
      break;
    }
    const settled = settleCall({
      userId,
      walletHash,
      requestId,
      capability: "risk_gate_bundle",
      cost: 15,
      txHash,
      amountAtomic: requiredAtomic(15),
    });
    if (!settled.ok) {
      unexpectedFailures += 1;
      break;
    }
    n += 1;
  }

  const quotesBefore = quotesIssued;
  const blocked = quoteCall({
    userId,
    requestId: `over-capacity-${i}`,
    capability: "risk_gate_bundle",
    cost: 15,
  });
  if (blocked.code !== "INSUFFICIENT_CREDITS") unexpectedFailures += 1;
  if (quotesIssued !== quotesBefore) paymentQuotesAfterInsufficientCapacity += 1;
}

const elapsedMs = performance.now() - started;
const activeAccounts = accounts.size;
const totalCreditsUsed = [...accounts.values()].reduce((sum, account) => sum + account.used, 0);
const usageRows = [...accounts.values()].reduce((sum, account) => sum + account.usage.size, 0);
const pendingClaims = [...txClaims.values()].filter((claim) => claim.verificationStatus !== "verified").length;
const quotaOverruns = [...accounts.values()].filter((account) => account.used > account.included).length;
const revenueMarked = [...paymentEvents.values()].filter((event) => event.commercialRevenue === true).length;
const expectedPrimaryCalls = USERS * REQUESTS_PER_USER;

if (txClaims.size !== usageRows) doubleCreditEvents += Math.abs(txClaims.size - usageRows);
if (paymentEvents.size !== txClaims.size) doublePaymentEvents += Math.abs(paymentEvents.size - txClaims.size);

const report = {
  ok:
    activeAccounts === USERS &&
    primaryPaidCalls === expectedPrimaryCalls &&
    pendingClaims === 0 &&
    quotaOverruns === 0 &&
    revenueMarked === 0 &&
    doubleCreditEvents === 0 &&
    doublePaymentEvents === 0 &&
    paymentQuotesAfterInsufficientCapacity === 0 &&
    reconciliationRecoveries === reconciliationFailuresInjected &&
    finalizationRecoveries === finalizationFailuresInjected &&
    unexpectedFailures === 0,
  model: "synthetic_in_memory_pay_per_call_settlement_replay_recovery_v2",
  users: USERS,
  requests_per_user_target: REQUESTS_PER_USER,
  expected_primary_paid_calls: expectedPrimaryCalls,
  primary_paid_calls: primaryPaidCalls,
  unpaid_402_quotes_issued: quotesIssued,
  exact_success_replays: exactReplays,
  idempotency_conflicts_blocked: idempotencyConflicts,
  reused_tx_attempts_blocked: reusedTxBlocked,
  underpayments_blocked: underpaymentsBlocked,
  wrong_wallet_attempts_blocked: wrongWalletBlocked,
  duplicate_wallet_attempts_blocked: duplicateWalletBlocked,
  insufficient_credit_attempts_blocked: insufficientCreditsBlocked,
  payment_quotes_after_insufficient_capacity: paymentQuotesAfterInsufficientCapacity,
  reconciliation_failures_injected: reconciliationFailuresInjected,
  reconciliation_recoveries: reconciliationRecoveries,
  finalization_failures_injected: finalizationFailuresInjected,
  finalization_recoveries: finalizationRecoveries,
  active_accounts: activeAccounts,
  quota_per_account: QUOTA,
  unique_usage_rows: usageRows,
  unique_payment_claims: txClaims.size,
  unique_payment_events: paymentEvents.size,
  pending_payment_claims: pendingClaims,
  total_credits_used: totalCreditsUsed,
  quota_overruns: quotaOverruns,
  testnet_events_marked_commercial_revenue: revenueMarked,
  double_credit_events: doubleCreditEvents,
  double_payment_events: doublePaymentEvents,
  unexpected_failures: unexpectedFailures,
  elapsed_ms: Number(elapsedMs.toFixed(3)),
  primary_calls_per_second: Number((expectedPrimaryCalls / (elapsedMs / 1000)).toFixed(2)),
  boundaries: {
    real_database_requests: false,
    real_network_requests: false,
    real_testnet_transactions: false,
    production_capacity_claim: false,
    validates_contract_invariants_only: true,
    execution_authorized: false,
    testnet_commercial_revenue: false,
  },
};

console.log(JSON.stringify(report, null, 2));
if (!report.ok) process.exit(1);
