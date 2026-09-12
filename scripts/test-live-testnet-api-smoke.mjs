import process from "node:process";

const baseUrl = (process.env.GEOMACRO_LIVE_BASE_URL || "https://geomacro.live").replace(/\/$/, "");

async function request(path, init = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    redirect: "follow",
    ...init,
  });
  const text = await response.text();
  return { response, text };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const access = await request("/testnet-access");
assert(access.response.status === 200, `/testnet-access expected 200, got ${access.response.status}`);
for (const marker of [
  "Test Geomacro intelligence and create your own API credentials.",
  "500-credit usage cap",
  "API Key + API Secret",
  "Receive HTTP 402",
]) {
  assert(access.text.includes(marker), `/testnet-access missing marker: ${marker}`);
}
assert((access.response.headers.get("cache-control") || "").toLowerCase().includes("no-store"), "/testnet-access missing Cache-Control: no-store");
assert((access.response.headers.get("x-content-type-options") || "").toLowerCase() === "nosniff", "/testnet-access missing X-Content-Type-Options: nosniff");

const config = await request("/api/testnet-tester/config");
assert(config.response.status === 401, `/api/testnet-tester/config expected 401 without session, got ${config.response.status}`);
assert(!/receiver_address|capability_prices|gmk_test_|gms_test_/i.test(config.text), "unauthenticated tester config leaked protected fields");

const unauth = await request("/api/testnet/intelligence", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    request_id: "live-smoke-unauth-001",
    capability: "gri_read",
    subject: { type: "global" },
  }),
});
assert(unauth.response.status === 401, `/api/testnet/intelligence expected 401 without credentials, got ${unauth.response.status}`);
assert(unauth.text.includes("COMMERCIAL_API_KEY_REQUIRED"), "developer API did not return COMMERCIAL_API_KEY_REQUIRED");
assert(!/display_score|raw_score|risk_object|payment_event_id|credits_remaining/i.test(unauth.text), "unauthenticated developer API leaked protected intelligence fields");

const halfAuth = await request("/api/testnet/intelligence", {
  method: "POST",
  headers: {
    "content-type": "application/json",
    "x-geomacro-api-key": "gmk_test_invalid_but_long_enough_1234567890",
  },
  body: JSON.stringify({
    request_id: "live-smoke-half-auth-001",
    capability: "gri_read",
    subject: { type: "global" },
  }),
});
assert(halfAuth.response.status === 401, `half-auth request expected 401, got ${halfAuth.response.status}`);
assert(halfAuth.text.includes("TESTNET_API_KEY_SECRET_REQUIRED"), "developer API did not enforce API Key + API Secret pair");

console.log("PASS: live Testnet API unauthenticated boundary smoke passed.");
console.log("NOTE: wallet signature, Testnet USDC settlement, 402 retry, credit consumption and signed GRO verification require a real tester wallet and are intentionally not automated here.");
