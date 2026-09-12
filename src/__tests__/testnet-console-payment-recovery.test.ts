import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

const script = readFileSync("public/testnet-console.js", "utf8");
const tx = `0x${"a".repeat(64)}`;
const payer = `0x${"1".repeat(40)}`;
const chain = { key: "arcTestnet", chain_id_hex: "0x4cef52", usdc_address: `0x${"2".repeat(40)}`, name: "Arc Testnet" };
const quote = { supported_chains: [chain], credit_cost: 1, credit_price_usdc: 0.5, amount_due_usdc: 0.5, amount_due_atomic: "500000", receiver_address: `0x${"3".repeat(40)}` };
const success = { ok: true, data: {}, entitlement: { credits_remaining: 499, credit_cost: 1 }, payment: { amount_due_usdc: 0.5 } };

async function browser(options: { receiptFailure?: boolean; deliveryFailure?: boolean; htmlDelivery?: boolean; wrongChain?: boolean; storage?: Map<string, string> } = {}) {
  const ids = new Map<string, any>();
  const nodes: any[] = [];
  function element(tag: string) {
    const node: any = {
      tag, value: "", style: {}, children: [], listeners: {}, hidden: false, disabled: false,
      setAttribute(key: string, value: string) { this[key] = value; if (key === "id") ids.set(value, this); },
      appendChild(child: any) { this.children.push(child); if (tag === "select" && !this.value) this.value = child.value; child.parentNode = this; },
      append(...children: any[]) { children.forEach(child => this.appendChild(child)); },
      addEventListener(name: string, listener: any) { this.listeners[name] = listener; },
    };
    nodes.push(node);
    return node;
  }
  const main = element("main");
  let boot: any;
  const storage = options.storage ?? new Map<string, string>();
  const bodies: any[] = [];
  let deliveries = 0;
  const fetch = vi.fn(async (url: string, init: any) => {
    if (url.endsWith("/me")) return Response.json({ ok: true, data: { access_status: "active", entitlement_grant_id: "grant-one" } });
    const body = JSON.parse(init.body);
    bodies.push(body);
    if (!body.payment) return Response.json({ ok: false, error: { code: "TESTNET_PAYMENT_REQUIRED" }, payment: quote }, { status: 402 });
    deliveries++;
    if (deliveries === 1 && options.deliveryFailure) throw new Error("API timeout");
    if (deliveries === 1 && options.htmlDelivery) return new Response("<html>Hosting fallback</html>");
    return Response.json(success);
  });
  const wallet = vi.fn(async ({ method }: any) => {
    if (method === "eth_requestAccounts") return [payer];
    if (method === "eth_chainId") return options.wrongChain ? "0x1" : chain.chain_id_hex;
    if (method === "wallet_switchEthereumChain") return null;
    if (method === "eth_sendTransaction") return tx;
    if (method === "eth_getTransactionReceipt") {
      if (options.receiptFailure) throw new Error("Receipt RPC timeout");
      return { blockNumber: "0x1", status: "0x1" };
    }
    throw new Error(method);
  });
  runInNewContext(script, {
    document: { createElement: element, getElementById: (id: string) => ids.get(id), querySelector: () => main, addEventListener: (_: string, fn: any) => { boot = fn; } },
    window: { ethereum: { request: wallet } },
    sessionStorage: { setItem: (k: string, v: string) => storage.set(k, v), getItem: (k: string) => storage.get(k) ?? null, removeItem: (k: string) => storage.delete(k) },
    fetch, crypto: { randomUUID: () => "fixed-request-0001" }, AbortSignal, setTimeout, TextEncoder,
  });
  await boot();
  const submit = () => ids.get("testerConsoleForm").listeners.submit({ preventDefault() {} });
  const pay = () => nodes.find(n => n.listeners.click && String(n.textContent).startsWith("Pay Testnet"))
    ?? nodes.find(n => String(n.textContent).startsWith("Retry existing"));
  return { ids, wallet, bodies, storage, submit, clickPay: () => pay().listeners.click(), sendCount: () => wallet.mock.calls.filter(([arg]) => arg.method === "eth_sendTransaction").length };
}

describe("browser Testnet payment recovery", () => {
  it.each(["receiptFailure", "deliveryFailure", "htmlDelivery"] as const)("does not send twice after %s", async failure => {
    const app = await browser({ [failure]: true });
    await app.submit();
    await app.clickPay();
    expect(app.sendCount()).toBe(1);
    expect(app.storage.size).toBe(1);
    expect(app.ids.get("testerConsoleStatus").textContent).not.toContain("Delivered successfully");
    // A new quote must not discard an already-sent payment.
    await app.submit();
    await app.clickPay();
    expect(app.sendCount()).toBe(1);
    expect(app.bodies.at(-1).request_id).toBe(app.bodies[0].request_id);
    expect(app.bodies.at(-1).payment.tx_hash).toBe(tx);
    expect(app.ids.get("testerConsoleStatus").textContent).toContain("Delivered successfully");
    expect(app.storage.size).toBe(0);
  });

  it("recovers the exact submitted request and proof after reload without another wallet request", async () => {
    const first = await browser({ receiptFailure: true });
    await first.submit();
    await first.clickPay();
    const reloaded = await browser({ storage: first.storage });
    await reloaded.clickPay();
    expect(reloaded.wallet).not.toHaveBeenCalled();
    expect(reloaded.bodies[0]).toEqual({ ...first.bodies[0], payment: { chain_key: chain.key, tx_hash: tx, payer_address: payer } });
  });

  it("blocks a transfer if the wallet stays on the wrong chain", async () => {
    const app = await browser({ wrongChain: true });
    await app.submit();
    await app.clickPay();
    expect(app.sendCount()).toBe(0);
    expect(app.ids.get("testerConsoleStatus").textContent).toContain("No payment was sent");
  });
  it("ignores concurrent quote and payment clicks", async () => {
    const app = await browser();
    await Promise.all([app.submit(), app.submit()]);
    expect(app.bodies).toHaveLength(1);
    await Promise.all([app.clickPay(), app.clickPay()]);
    expect(app.sendCount()).toBe(1);
  });
});
