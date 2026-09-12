import { defineEventHandler, setResponseHeaders } from "h3";

import baseTestnetAccessHandler from "./testnet-access.get";

type Handler = (event: unknown) => unknown | Promise<unknown>;

const AUTH_FLOW = "wallet-first-v2";
const AUTH_SCRIPT = "/testnet-wallet-first-v2.js";

function walletFirstHtml(input: string) {
  let html = input;

  // Always inject the wallet-first controller by a new asset name so a stale
  // CDN/browser copy of the legacy onboarding script cannot keep the old flow.
  if (!html.includes(AUTH_SCRIPT)) {
    html = html.replace(
      "</head>",
      `<meta name="geomacro-testnet-auth-flow" content="${AUTH_FLOW}" />\n<script src="${AUTH_SCRIPT}" defer></script>\n</head>`,
    );
  }

  html = html.replace("<body>", `<body data-testnet-auth-flow="${AUTH_FLOW}">`);
  html = html.replace(
    "TESTNET · PAY PER CALL",
    "TESTNET · WALLET SIGN-IN · PAY PER CALL",
  );
  html = html.replace(
    "Create a tester profile, verify one EVM wallet with a non-transaction signature, then create an API Key + API Secret. There is no upfront Testnet USDC activation payment. Each API request quotes its own Testnet USDC amount at 0.5 Testnet USDC per credit.",
    "Connect one EVM wallet and sign a one-time message. Existing wallets resume the same Testnet developer account; new wallets create one only after signature verification. Then create an API Key + API Secret and pay only per API call.",
  );
  html = html.replace(
    '<div class="card"><strong>Profile + wallet</strong><p>Create a tester profile and verify one EVM wallet to activate Testnet developer access.</p></div>',
    '<div class="card"><strong>Wallet sign-in</strong><p>Your wallet is the Testnet identity. Sign once to create or resume developer access without duplicate profiles.</p></div>',
  );
  html = html.replace("CREATE TESTER PROFILE", "WALLET SIGN-IN");
  html = html.replace("Start developer access", "Connect your wallet to continue");
  html = html.replace(
    "Profile name and one verified wallet are the only identity steps for the current Testnet program.",
    "Your wallet is the Testnet identity. Existing accounts resume automatically. A display name is optional and used only for a new wallet account.",
  );
  html = html.replace(
    '<label for="profileNameInput">Profile name</label><input id="profileNameInput" maxlength="64" required autocomplete="name" />',
    '<label for="profileNameInput">Display name (optional for a new wallet)</label><input id="profileNameInput" maxlength="64" autocomplete="name" placeholder="Optional display name" />',
  );
  html = html.replace("Create tester profile", "Connect wallet & sign in");
  html = html.replace("Connect & verify wallet", "Sign in with wallet");

  return html;
}

export default defineEventHandler(async (event) => {
  const base = await (baseTestnetAccessHandler as unknown as Handler)(event);
  setResponseHeaders(event, {
    "Cache-Control": "no-store",
    "X-Geomacro-Testnet-Auth-Flow": AUTH_FLOW,
  });
  if (typeof base !== "string") return base;
  return walletFirstHtml(base);
});
