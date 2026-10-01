import { describe, expect, it } from "vitest";
import { CommerceLedger } from "../../workers/commerce-ledger/src/index.mjs";

type LedgerRecord = Record<string, unknown>;

class FakeTransactionalStorage {
  readonly rows = new Map<string, unknown>();

  async transaction<T>(fn: (txn: {
    get: (key: string) => Promise<unknown>;
    put: (key: string, value: unknown) => Promise<void>;
  }) => Promise<T>): Promise<T> {
    return fn({
      get: async (key) => this.rows.get(key),
      put: async (key, value) => {
        this.rows.set(key, structuredClone(value));
      },
    });
  }
}

function fingerprint(char: string) {
  return char.repeat(64);
}

function baseClaim(paymentFingerprint = fingerprint("a"), requestFingerprint = fingerprint("b")) {
  return {
    provider: "coinbase_x402",
    providerEnvironment: "base-mainnet",
    paymentFingerprint,
    requestFingerprint,
    productId: "geomacro-intelligence-v1",
    clientRequestId: "request-0001",
    sourceChannel: "x402",
    rail: "coinbase_x402",
    network: "base",
    asset: "USDC",
    amountAtomic: "50000",
    recipientHash: fingerprint("c"),
  };
}

async function post(ledger: CommerceLedger, action: string, body: Record<string, unknown>) {
  return ledger.fetch(new Request(`https://ledger.internal/${action}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }));
}

async function json(response: Response) {
  return response.json() as Promise<Record<string, unknown>>;
}

describe("Supabase-independent Durable Object commerce ledger", () => {
  it("claims once, prepares before settlement, completes once, then replays exact output", async () => {
    const storage = new FakeTransactionalStorage();
    const ledger = new CommerceLedger({ storage } as never, {} as never);
    const claimInput = baseClaim();

    const first = await json(await post(ledger, "claim", claimInput));
    expect(first.disposition).toBe("CLAIMED");
    expect(typeof first.claim_token).toBe("string");
    const claimToken = String(first.claim_token);

    const concurrentReplay = await json(await post(ledger, "claim", claimInput));
    expect(concurrentReplay.disposition).toBe("IN_PROGRESS");

    const conflict = await json(await post(ledger, "claim", {
      ...claimInput,
      requestFingerprint: fingerprint("d"),
    }));
    expect(conflict.disposition).toBe("CONFLICT");

    const responsePayload = {
      ok: true,
      request_id: "request-0001",
      risk: { score: 42 },
    };
    const responseSha256 = fingerprint("e");
    const prepared = await json(await post(ledger, "prepare", {
      paymentFingerprint: claimInput.paymentFingerprint,
      claimToken,
      responsePayload,
      responseSha256,
    }));
    expect(prepared.ok).toBe(true);

    const completed = await json(await post(ledger, "complete", {
      paymentFingerprint: claimInput.paymentFingerprint,
      claimToken,
      payerHash: fingerprint("f"),
      settlementReference: "0xsettlement-0001",
      settlementNetwork: "base",
    }));
    expect(completed.ok).toBe(true);

    const replay = await json(await post(ledger, "claim", claimInput));
    expect(replay.disposition).toBe("REPLAY");
    expect(replay.response_payload).toEqual(responsePayload);
    expect(replay.response_sha256).toBe(responseSha256);
    expect(replay.settlement_reference).toBe("0xsettlement-0001");
    expect(replay.settlement_network).toBe("base");
  });

  it("rejects reusing one settlement reference for a different payment", async () => {
    const storage = new FakeTransactionalStorage();
    const ledger = new CommerceLedger({ storage } as never, {} as never);

    const settle = async (paymentChar: string, requestChar: string, settlementReference: string) => {
      const input = baseClaim(fingerprint(paymentChar), fingerprint(requestChar));
      const claim = await json(await post(ledger, "claim", input));
      expect(claim.disposition).toBe("CLAIMED");
      const token = String(claim.claim_token);
      expect((await json(await post(ledger, "prepare", {
        paymentFingerprint: input.paymentFingerprint,
        claimToken: token,
        responsePayload: { payment: paymentChar },
        responseSha256: fingerprint("9"),
      }))).ok).toBe(true);
      return json(await post(ledger, "complete", {
        paymentFingerprint: input.paymentFingerprint,
        claimToken: token,
        settlementReference,
        settlementNetwork: "base",
      }));
    };

    expect((await settle("1", "2", "shared-settlement-reference")).ok).toBe(true);
    expect((await settle("3", "4", "shared-settlement-reference")).ok).toBe(false);
  });

  it("moves an expired prepared lease to manual review instead of permitting another settlement", async () => {
    const storage = new FakeTransactionalStorage();
    const ledger = new CommerceLedger({ storage } as never, {} as never);
    const input = baseClaim(fingerprint("5"), fingerprint("6"));

    const claim = await json(await post(ledger, "claim", input));
    const token = String(claim.claim_token);
    expect(claim.disposition).toBe("CLAIMED");

    expect((await json(await post(ledger, "prepare", {
      paymentFingerprint: input.paymentFingerprint,
      claimToken: token,
      responsePayload: { ok: true },
      responseSha256: fingerprint("7"),
    }))).ok).toBe(true);

    const key = `payment:${input.paymentFingerprint}`;
    const current = storage.rows.get(key) as LedgerRecord;
    storage.rows.set(key, { ...current, leaseExpiresAt: Date.now() - 1 });

    const next = await json(await post(ledger, "claim", input));
    expect(next.disposition).toBe("MANUAL_REVIEW");

    const stored = storage.rows.get(key) as LedgerRecord;
    expect(stored.state).toBe("manual_review");
    expect(stored.failureCode).toBe("PREPARED_LEASE_EXPIRED_RECONCILIATION_REQUIRED");
    expect(stored.claimToken).toBeNull();
  });
});
