import { describe, expect, it } from "vitest";
// The production worker is authored as ESM JavaScript and intentionally has no
// Node-specific dependency; importing it here exercises the same state machine.
// @ts-expect-error JavaScript worker module has no declaration file.
import { CommerceLedger } from "../../workers/commerce-ledger/src/index.mjs";

type RecordValue = Record<string, unknown>;

class MemoryStorage {
  private data = new Map<string, unknown>();

  async get(key: string) {
    return this.data.get(key);
  }

  async put(key: string, value: unknown) {
    this.data.set(key, structuredClone(value));
  }

  async transaction<T>(fn: (txn: MemoryStorage) => Promise<T>) {
    return fn(this);
  }
}

function request(action: string, body: RecordValue) {
  return new Request(`https://ledger.internal/${action}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const payment = (digit: string) => digit.repeat(64);

async function body(response: Response) {
  return (await response.json()) as Record<string, unknown>;
}

describe("CommerceLedger durable control-plane state machine", () => {
  it("enforces daily amount limits without double-counting an idempotent reservation", async () => {
    const ledger = new CommerceLedger({ storage: new MemoryStorage() }, {});
    const common = {
      payerHash: "a".repeat(64),
      amountAtomic: "50000",
      maxDailyAmountAtomic: "100000",
      maxDailyRequests: 10,
    };

    expect(await body(await ledger.fetch(request("usage-reserve", { ...common, paymentFingerprint: payment("1") })))).toMatchObject({ disposition: "RESERVED" });
    expect(await body(await ledger.fetch(request("usage-reserve", { ...common, paymentFingerprint: payment("1") })))).toMatchObject({ disposition: "RESERVED" });
    expect(await body(await ledger.fetch(request("usage-reserve", { ...common, paymentFingerprint: payment("2") })))).toMatchObject({ disposition: "RESERVED" });
    expect(await body(await ledger.fetch(request("usage-reserve", { ...common, paymentFingerprint: payment("3") })))).toMatchObject({ disposition: "SPEND_LIMIT" });
  });

  it("releases pre-settlement reservations, retains finalized usage, and keeps manual review conservative", async () => {
    const ledger = new CommerceLedger({ storage: new MemoryStorage() }, {});
    const common = {
      payerHash: "b".repeat(64),
      amountAtomic: "40000",
      maxDailyAmountAtomic: "80000",
      maxDailyRequests: 2,
    };

    await ledger.fetch(request("usage-reserve", { ...common, paymentFingerprint: payment("4") }));
    expect(await body(await ledger.fetch(request("usage-release", { paymentFingerprint: payment("4"), manualReview: false })))).toEqual({ ok: true });

    await ledger.fetch(request("usage-reserve", { ...common, paymentFingerprint: payment("5") }));
    expect(await body(await ledger.fetch(request("usage-finalize", { paymentFingerprint: payment("5") })))).toEqual({ ok: true });
    expect(await body(await ledger.fetch(request("usage-release", { paymentFingerprint: payment("5"), manualReview: false })))).toEqual({ ok: false });

    await ledger.fetch(request("usage-reserve", { ...common, paymentFingerprint: payment("6") }));
    expect(await body(await ledger.fetch(request("usage-release", { paymentFingerprint: payment("6"), manualReview: true })))).toEqual({ ok: true });
    expect(await body(await ledger.fetch(request("usage-reserve", { ...common, paymentFingerprint: payment("6") })))).toMatchObject({ disposition: "MANUAL_REVIEW" });
  });

  it("keeps product audit updates payment-bound and rejects query-plan mutation", async () => {
    const ledger = new CommerceLedger({ storage: new MemoryStorage() }, {});
    const fingerprint = payment("7");
    const baseAudit = {
      payment_fingerprint_sha256: fingerprint,
      query_plan_hash: "q".repeat(64),
      status: "prepared",
    };
    expect(await body(await ledger.fetch(request("audit-upsert", { paymentFingerprint: fingerprint, audit: baseAudit })))).toEqual({ ok: true });
    expect(await body(await ledger.fetch(request("audit-upsert", { paymentFingerprint: fingerprint, audit: { ...baseAudit, status: "delivered" } })))).toEqual({ ok: true });
    expect(await body(await ledger.fetch(request("audit-upsert", { paymentFingerprint: fingerprint, audit: { ...baseAudit, query_plan_hash: "x".repeat(64) } })))).toEqual({ ok: false });
  });
});
