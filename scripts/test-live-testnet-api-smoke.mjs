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
  "client-wallet-first-v4-public-developer",
  "PUBLIC TESTER + DEVELOPER API",
  "Geomacro Testnet Access",
  "Sign in with wallet",
  "Public Testnet access",
  "Developer integrations (optional)",
  "Disconnect wallet",
  "API Secret is shown only once",
  "gmk_public_arc_testnet_v1",
  "gmk_public_base_sepolia_v1",
  "gmk_public_polygon_amoy_v1",
]) {
  assert(access.text.includes(marker), `/testnet-access missing marker: ${marker}`);
}
assert(!access.text.includes("Connect & verify wallet"), "/testnet-access is serving the retired wallet verification UI");
assert(!access.text.includes("CREATE TESTER PROFILE"), "/testnet-access is serving the retired profile-first onboarding UI");
assert(!access.text.includes("Hidden Testnet Developer Access"), "/testnet-access is serving retired temporary/hidden copy");

const config = await request("/api/testnet-tester/config");
assert(config.response.status === 401, `/api/testnet-tester/config expected 401 without session, got ${config.response.status}`);
assert(!/receiver_address|capability_prices|gmk_test_|gms_test_/i.test(config.text), "unauthenticated tester config leaked protected fields");

const publicUnauth = await request("/api/testnet-tester/intelligence", {
  method: "POST",
  headers: {
    "content-type": "application/json",
    "x-geomacro-public-key": "gmk_public_arc_testnet_v1",
  },
  body: JSON.stringify({
    request_id: "live-smoke-public-unauth-001",
    capability: "gri_read",
    subject: { type: "global" },
  }),
});
assert(publicUnauth.response.status === 401, `/api/testnet-tester/intelligence expected 401 without wallet session, got ${publicUnauth.response.status}`);
assert(!/display_score|raw_score|risk_object|payment_event_id|credits_remaining/i.test(publicUnauth.text), "public key without wallet session leaked protected intelligence fields");

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

console.log("PASS: live permanent Testnet public/developer deployment and unauthenticated boundaries passed.");
console.log("NOTE: wallet signature, Testnet USDC settlement, 402 retry, credit consumption and signed GRO verification require a real tester wallet and are intentionally not automated here.");