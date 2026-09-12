import { defineEventHandler } from "h3";

import baseTestnetAccessHandler from "./testnet-access.get";

type Handler = (event: unknown) => unknown | Promise<unknown>;

export default defineEventHandler(async (event) => {
  const base = await (baseTestnetAccessHandler as unknown as Handler)(event);
  if (typeof base !== "string") return base;

  return base
    .replace(
      '<script src="/testnet-access.js" defer></script>',
      '<script src="/testnet-access.js" defer></script>\n<script src="/testnet-wallet-first.js" defer></script>',
    )
    .replace(
      "Create a tester profile, verify one EVM wallet with a non-transaction signature, then create an API Key + API Secret. There is no upfront Testnet USDC activation payment. Each API request quotes its own Testnet USDC amount at 0.5 Testnet USDC per credit.",
      "Connect one EVM wallet and sign a one-time message. Existing wallets resume their Testnet developer account automatically; new wallets get an account after signature verification. Then create an API Key + API Secret and pay only per API call.",
    )
    .replace(
      '<div class="card"><strong>Profile + wallet</strong><p>Create a tester profile and verify one EVM wallet to activate Testnet developer access.</p></div>',
      '<div class="card"><strong>Wallet sign-in</strong><p>Your verified wallet is the Testnet account identity. Sign once to create or resume developer access without duplicate profiles.</p></div>',
    )
    .replace('<div class="eyebrow">CREATE TESTER PROFILE</div>', '<div class="eyebrow">WALLET SIGN-IN</div>')
    .replace('<h2>Start developer access</h2>', '<h2>Connect your wallet to continue</h2>')
    .replace(
      '<p class="muted">Profile name and one verified wallet are the only identity steps for the current Testnet program.</p>',
      '<p class="muted">The wallet is your Testnet identity. Existing accounts resume automatically. A display name is optional and used only when creating a new wallet account.</p>',
    )
    .replace(
      '<div class="field full"><label for="profileNameInput">Profile name</label><input id="profileNameInput" maxlength="64" required autocomplete="name" /></div>',
      '<div class="field full"><label for="profileNameInput">Display name (optional for a new wallet)</label><input id="profileNameInput" maxlength="64" autocomplete="name" placeholder="Optional display name" /></div>',
    )
    .replace('<button type="submit">Create tester profile</button>', '<button type="submit">Connect wallet & sign in</button>')
    .replace('>Connect & verify wallet</button>', '>Sign in with wallet</button>');
});
