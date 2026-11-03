import {it,expect} from "vitest";
import {freezeCanonicalCapabilityHttpBody as freeze,sendFrozenCapabilityHttpBody as send} from "./capability-x402-exact-http-body.server";
import { commerceSha256, stableCommerceJson } from "./agent-commerce-delivery.server";
it("sends exactly canonical UTF-8 bytes and binds the authenticated ledger hash",async()=>{
  const input={z:"বাংলা",a:{why:"Derived output"}};
  const body=freeze(input);input.a.why="changed after quote";
  const response=send(body,body.sha256,{"PAYMENT-RESPONSE":"test-receipt"});
  expect(await response.text()).toBe(body.body);
  expect(body.body).not.toContain("changed after quote");
  expect(response.headers.get("X-Geomacro-Delivery-SHA256")).toBe(body.sha256);
  expect(()=>send(body,"f".repeat(64),{})).toThrow("X402_FINAL_HTTP_LEDGER_BODY_HASH_MISMATCH");
  expect(()=>send({...body,body:body.body+" "},body.sha256,{})).toThrow("X402_FINAL_HTTP_LEDGER_BODY_HASH_MISMATCH");
});
it("rejects values that JSON could coerce or omit, cycles, excessive depth and oversized bytes",()=>{
  const cyclic:any={};cyclic.self=cyclic;
  let deep:any={};for(let i=0;i<65;i++)deep={deep};
  for(const bad of [null,[],{value:NaN},{value:Infinity},{value:undefined},{value:1n},{value:()=>1},{value:Symbol()}, {value:new Date()}, {value:new Array(2)},cyclic,deep])
    expect(()=>freeze(bad)).toThrow();
  expect(()=>freeze({value:"a".repeat(96*1024)})).toThrow("X402_FINAL_HTTP_BODY_SIZE_INVALID");
});

it("refuses upstream source material BEFORE quote/settlement across the common HTTP wire", () => {
  const leaks = [
    { answer: { summary: "Original https://news.un.org/en/story/2026/11/1" } },
    { analysis: { article_body: "publisher full text fixture" } },
    { nested: [{ source_id: "private-upstream-id" }] },
    { findings: { raw_html: "<article>publisher fixture</article>" } },
    { answer: { note: "USGS source feed" } },
    { upstream: { storage_blob: "private-archive-bytes" } },
  ];
  for (const payload of leaks) {
    expect(() => freeze(payload)).toThrow(/PAID_OUTPUT_/);
  }
});

it("refuses a forged or legacy stored replay even when its immutable body SHA matches", () => {
  const raw = stableCommerceJson({
    answer: { summary: "Private upstream: https://publisher.example/story/secret" },
    payment: { provider: "coinbase_x402" },
  });
  const hash = commerceSha256(raw);
  expect(() => send({ body: raw, sha256: hash }, hash,
    { "PAYMENT-RESPONSE": "opaque-receipt" }))
    .toThrow(/PAID_OUTPUT_EMBEDDED_SOURCE_URL/);
});

it("still delivers clean structured material and exact immutable receipts", async () => {
  const prepared = freeze({
    answer: { summary: "Current currency risk is elevated on verified evidence." },
    limitations: { raw_data_delivered: false },
    payment: { provider: "coinbase_x402", amount_atomic: "50000" },
  });
  const sent = send(prepared, prepared.sha256, { "PAYMENT-RESPONSE": "opaque" });
  expect(sent.status).toBe(200);
  expect(sent.headers.get("Cache-Control")).toBe("no-store");
  expect(await sent.text()).toBe(prepared.body);
});
