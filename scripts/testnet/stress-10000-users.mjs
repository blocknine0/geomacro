import { performance } from "node:perf_hooks";

const USERS = Number(process.env.TESTNET_STRESS_USERS || 10_000);
const QUOTA = 500;
const REQUESTS_PER_USER = Number(process.env.TESTNET_STRESS_REQUESTS_PER_USER || 20);
const costs = [1, 3, 5, 8, 10, 12, 15];

if (!Number.isInteger(USERS) || USERS < 1 || USERS > 100_000) {
  throw new Error("TESTNET_STRESS_USERS must be an integer between 1 and 100000");
}

const emailOwners = new Map();
const walletOwners = new Map();
const txClaims = new Map();
const accounts = new Map();
let duplicateEmailBlocked = 0;
let duplicateWalletBlocked = 0;
let replayedTx = 0;
let usageAccepted = 0;
let usageRejected = 0;
let doubleCredit = 0;

function activate({ userId, emailHash, walletHash, txHash }) {
  const emailOwner = emailOwners.get(emailHash);
  if (emailOwner && emailOwner !== userId) {
    duplicateEmailBlocked += 1;
    return { ok: false, code: "EMAIL_ALREADY_USED" };
  }
  const walletOwner = walletOwners.get(walletHash);
  if (walletOwner && walletOwner !== userId) {
    duplicateWalletBlocked += 1;
    return { ok: false, code: "WALLET_ALREADY_USED" };
  }

  const txOwner = txClaims.get(txHash);
  if (txOwner) {
    if (txOwner !== userId) return { ok: false, code: "TX_ALREADY_CLAIMED" };
    replayedTx += 1;
    return { ok: true, idempotent_replay: true, credits_granted: 0 };
  }

  if (accounts.has(userId)) return { ok: false, code: "FIXED_QUOTA_ALREADY_ACTIVE" };

  emailOwners.set(emailHash, userId);
  walletOwners.set(walletHash, userId);
  txClaims.set(txHash, userId);
  accounts.set(userId, { included: QUOTA, used: 0, requestIds: new Map() });
  return { ok: true, idempotent_replay: false, credits_granted: QUOTA };
}

function consume(userId, requestId, cost) {
  const account = accounts.get(userId);
  if (!account) return { ok: false, code: "ACCOUNT_NOT_FOUND" };
  const previous = account.requestIds.get(requestId);
  if (previous !== undefined) {
    return { ok: true, idempotent_replay: true, credit_cost: previous, remaining: account.included - account.used };
  }
  if (account.used + cost > account.included) {
    usageRejected += 1;
    return { ok: false, code: "INSUFFICIENT_CREDITS" };
  }
  account.requestIds.set(requestId, cost);
  account.used += cost;
  usageAccepted += 1;
  return { ok: true, idempotent_replay: false, credit_cost: cost, remaining: account.included - account.used };
}

const started = performance.now();

for (let i = 0; i < USERS; i += 1) {
  const userId = `user-${i}`;
  const activation = activate({
    userId,
    emailHash: `email-${i}`,
    walletHash: `wallet-${i}`,
    txHash: `tx-${i}`,
  });
  if (!activation.ok || activation.credits_granted !== QUOTA) throw new Error(`activation failed for ${userId}`);

  const replay = activate({
    userId,
    emailHash: `email-${i}`,
    walletHash: `wallet-${i}`,
    txHash: `tx-${i}`,
  });
  if (!replay.ok || !replay.idempotent_replay || replay.credits_granted !== 0) {
    doubleCredit += 1;
  }

  for (let j = 0; j < REQUESTS_PER_USER; j += 1) {
    const cost = costs[(i + j) % costs.length];
    const requestId = `req-${i}-${j}`;
    const first = consume(userId, requestId, cost);
    if (!first.ok) break;
    const beforeReplayRemaining = first.remaining;
    const repeated = consume(userId, requestId, cost);
    if (!repeated.ok || !repeated.idempotent_replay || repeated.remaining !== beforeReplayRemaining) {
      throw new Error(`usage replay invariant failed for ${requestId}`);
    }
  }
}

for (let i = 0; i < Math.min(USERS, 1000); i += 1) {
  activate({
    userId: `duplicate-email-${i}`,
    emailHash: `email-${i}`,
    walletHash: `fresh-wallet-email-${i}`,
    txHash: `fresh-tx-email-${i}`,
  });
  activate({
    userId: `duplicate-wallet-${i}`,
    emailHash: `fresh-email-wallet-${i}`,
    walletHash: `wallet-${i}`,
    txHash: `fresh-tx-wallet-${i}`,
  });
}

const elapsedMs = performance.now() - started;
const totalCreditsIssued = [...accounts.values()].reduce((sum, account) => sum + account.included, 0);
const totalCreditsUsed = [...accounts.values()].reduce((sum, account) => sum + account.used, 0);

const report = {
  ok: doubleCredit === 0 && accounts.size === USERS,
  model: "synthetic_in_memory_contract_stress",
  users: USERS,
  requests_per_user_target: REQUESTS_PER_USER,
  active_accounts: accounts.size,
  quota_per_account: QUOTA,
  total_credits_issued: totalCreditsIssued,
  total_credits_used: totalCreditsUsed,
  usage_accepted: usageAccepted,
  usage_rejected: usageRejected,
  exact_tx_replays: replayedTx,
  double_credit_events: doubleCredit,
  duplicate_email_attempts_blocked: duplicateEmailBlocked,
  duplicate_wallet_attempts_blocked: duplicateWalletBlocked,
  elapsed_ms: Number(elapsedMs.toFixed(3)),
  users_per_second: Number((USERS / (elapsedMs / 1000)).toFixed(2)),
  boundaries: {
    real_network_requests: false,
    real_testnet_transactions: false,
    production_capacity_claim: false,
  },
};

console.log(JSON.stringify(report, null, 2));
if (!report.ok) process.exit(1);
