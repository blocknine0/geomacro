#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";

const workerPath = "workers/x402-ledger/src/index.mjs";
const testPath = "src/__tests__/x402-d1-ledger-static.test.ts";

let worker = readFileSync(workerPath, "utf8");
const oldCrypto = `async function sha256(value) {
  return hex(await crypto.subtle.digest("SHA-256", textEncoder.encode(value)));
}

async function hmacHex(secret, value) {
  const key = await crypto.subtle.importKey(
    "raw",
    textEncoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return hex(await crypto.subtle.sign("HMAC", key, textEncoder.encode(value)));
}

function timingSafeHexEqual(left, right) {
  if (typeof left !== "string" || typeof right !== "string" || left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i += 1) diff |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return diff === 0;
}`;
const newCrypto = `function unhex(value) {
  const out = new Uint8Array(value.length / 2);
  for (let i = 0; i < out.length; i += 1) out[i] = Number.parseInt(value.slice(i * 2, i * 2 + 2), 16);
  return out;
}

async function sha256(value) {
  return hex(await crypto.subtle.digest("SHA-256", textEncoder.encode(value)));
}`;
if (worker.includes(oldCrypto)) worker = worker.replace(oldCrypto, newCrypto);

const oldAuth = `  const expected = await hmacHex(secret, signed);
  return timingSafeHexEqual(signature, expected);`;
const newAuth = `  const key = await crypto.subtle.importKey(
    "raw",
    textEncoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  return crypto.subtle.verify("HMAC", key, unhex(signature), textEncoder.encode(signed));`;
if (worker.includes(oldAuth)) worker = worker.replace(oldAuth, newAuth);

const oldClaim = `function validClaim(input) {
  return input &&`;
const newClaim = `function validClaim(input) {
  const amount = String(input?.amount_atomic ?? "");
  return input &&`;
if (worker.includes(oldClaim)) worker = worker.replace(oldClaim, newClaim);
worker = worker.replace(
  `/^\\d+$/.test(String(input.amount_atomic ?? "")) && BigInt(String(input.amount_atomic)) > 0n &&`,
  `amount.length >= 1 && amount.length <= 78 && /^\\d+$/.test(amount) && BigInt(amount) > 0n &&`,
);

if (!worker.includes('crypto.subtle.verify("HMAC"') || worker.includes("timingSafeHexEqual") || !worker.includes("amount.length <= 78")) {
  throw new Error("D1 worker hardening patch did not converge");
}
writeFileSync(workerPath, worker);

let test = readFileSync(testPath, "utf8");
test = test.replace(
  'it("authenticates every mutation with a timestamped HMAC", () => {',
  'it("authenticates every mutation with a timestamped WebCrypto HMAC verification", () => {',
);
test = test.replace(
  `    expect(worker).toContain('name: "HMAC"');\n  });`,
  `    expect(worker).toContain('name: "HMAC"');\n    expect(worker).toContain('crypto.subtle.verify("HMAC"');\n    expect(worker).not.toContain("timingSafeHexEqual");\n  });\n\n  it("bounds atomic amount parsing to the production numeric domain", () => {\n    expect(worker).toContain("amount.length <= 78");\n    expect(worker).toContain("BigInt(amount) > 0n");\n  });`,
);
test = test.replace(`expect(worker).toContain('state=\\'manual_review\\'');`, `expect(worker).toContain("state='manual_review'");`);
if (!test.includes("bounds atomic amount parsing") || !test.includes('crypto.subtle.verify("HMAC"')) {
  throw new Error("D1 static test hardening patch did not converge");
}
writeFileSync(testPath, test);
console.log(JSON.stringify({ ok: true }));
