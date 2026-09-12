(() => {
  const $ = (id) => document.getElementById(id);
  const announcedWallets = [];
  let signingIn = false;

  function firstString(...values) {
    for (const value of values) {
      if (typeof value === "string" && value.trim()) return value.trim();
    }
    return "";
  }

  function rememberWalletProvider(detail) {
    const provider = detail?.provider;
    if (!provider?.request) return;
    if (announcedWallets.some((entry) => entry.provider === provider)) return;
    announcedWallets.push({ provider, name: firstString(detail?.info?.name) || "EVM wallet" });
  }

  window.addEventListener("eip6963:announceProvider", (event) => rememberWalletProvider(event.detail));
  try {
    window.dispatchEvent(new Event("eip6963:requestProvider"));
  } catch {
    // window.ethereum fallback below.
  }

  function walletProvider() {
    if (announcedWallets.length > 0) return announcedWallets[0];
    if (window.ethereum?.request) return { provider: window.ethereum, name: "EVM wallet" };
    return null;
  }

  function utf8ToHex(value) {
    const bytes = new TextEncoder().encode(String(value));
    return `0x${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
  }

  async function personalSign(provider, message, address) {
    const encoded = utf8ToHex(message);
    try {
      return await provider.request({ method: "personal_sign", params: [encoded, address] });
    } catch (error) {
      if (error?.code === 4001) throw error;
      const detail = firstString(error?.message, error?.shortMessage, error?.reason);
      if (!/param|argument|address|data|invalid/i.test(detail)) throw error;
      return provider.request({ method: "personal_sign", params: [address, encoded] });
    }
  }

  async function json(url, options = {}) {
    const response = await fetch(url, {
      credentials: "same-origin",
      headers: {
        accept: "application/json",
        ...(options.body ? { "content-type": "application/json" } : {}),
        ...(options.headers || {}),
      },
      ...options,
    });
    const payload = await response.json().catch(() => null);
    if (!payload || typeof payload !== "object") throw new Error("The server returned an invalid response.");
    if (!response.ok || payload.ok === false) {
      const message = firstString(
        payload.error,
        payload?.error?.message,
        payload?.error?.code,
        payload.statusMessage,
        payload.message,
        response.statusText,
      );
      const error = new Error(message || `Request failed (${response.status})`);
      error.status = response.status;
      throw error;
    }
    return payload;
  }

  function statusElement() {
    const account = $("accountPanel");
    if (account && !account.hidden) return $("walletActionStatus");
    return $("registrationStatus") || $("globalStatus");
  }

  function setStatus(message) {
    const el = statusElement();
    if (el) el.textContent = message;
  }

  function friendlyError(error) {
    if (error?.code === 4001) return "Wallet request was cancelled.";
    const code = firstString(error?.message, error?.shortMessage, error?.reason);
    const messages = {
      TESTNET_SIGNIN_CHALLENGE_EXPIRED: "The sign-in request expired. Try again.",
      TESTNET_SIGNIN_CHALLENGE_USED_OR_EXPIRED: "That sign-in request was already used or expired. Try again.",
      TESTNET_SIGNIN_MESSAGE_MISMATCH: "The wallet sign-in message did not match the server challenge.",
      TESTNET_WALLET_SIGNATURE_INVALID: "The wallet signature could not be verified.",
      TESTNET_PROFILE_NOT_ACTIVE: "This Testnet account is not active. Contact Geomacro support.",
      INVALID_WALLET_ADDRESS: "The connected wallet address is invalid.",
      INVALID_PROFILE_NAME: "Display name must be between 2 and 64 characters.",
    };
    return messages[code] || code || "Wallet sign-in failed.";
  }

  function optionalProfileName() {
    const input = $("profileNameInput");
    const supplied = String(input?.value || "").trim();
    if (supplied) return supplied;
    const current = String($("profileStatus")?.textContent || "").trim();
    return current && current !== "Tester" ? current : "";
  }

  async function signInWithWallet() {
    if (signingIn) return;
    const wallet = walletProvider();
    if (!wallet) {
      setStatus("No injected EVM wallet detected. Enable Rabby, MetaMask or another EVM wallet and reload.");
      return;
    }

    signingIn = true;
    const buttons = [$("walletConnect"), $("registrationForm")?.querySelector('button[type="submit"]')].filter(Boolean);
    buttons.forEach((button) => { button.disabled = true; });

    try {
      setStatus(`Opening ${wallet.name}...`);
      const accounts = await wallet.provider.request({ method: "eth_requestAccounts" });
      const walletAddress = String(accounts?.[0] || "").trim();
      if (!/^0x[0-9a-fA-F]{40}$/.test(walletAddress)) throw new Error("INVALID_WALLET_ADDRESS");

      setStatus("Preparing a one-time wallet sign-in message...");
      const challenge = await json("/api/testnet-tester/auth-challenge", {
        method: "POST",
        body: JSON.stringify({ wallet_address: walletAddress }),
      });
      const data = challenge.data || {};
      if (!data.message || !data.nonce || !data.issued_at) throw new Error("TESTNET_SIGNIN_CHALLENGE_FAILED");

      setStatus("Approve the sign-in message in your wallet. This is not a transaction and cannot move funds.");
      const signature = await personalSign(wallet.provider, String(data.message), walletAddress);

      setStatus("Verifying wallet and opening your Testnet developer account...");
      const verified = await json("/api/testnet-tester/auth-verify", {
        method: "POST",
        body: JSON.stringify({
          wallet_address: walletAddress,
          nonce: data.nonce,
          issued_at: data.issued_at,
          message: data.message,
          signature,
          profile_name: optionalProfileName() || undefined,
        }),
      });

      const created = verified?.data?.account_created === true;
      setStatus(created ? "Wallet verified. Developer account created." : "Wallet verified. Existing developer account resumed.");
      window.location.reload();
    } catch (error) {
      setStatus(friendlyError(error));
    } finally {
      signingIn = false;
      buttons.forEach((button) => { button.disabled = false; });
    }
  }

  function updateCopy() {
    const hero = document.querySelector(".hero p");
    if (hero) {
      hero.textContent = "Connect one EVM wallet and sign a one-time message. Existing wallets resume their Testnet developer account automatically; new wallets get an account after signature verification. Then create API credentials and pay only per API call.";
    }

    const cards = document.querySelectorAll(".grid .card");
    if (cards[0]) {
      const title = cards[0].querySelector("strong");
      const copy = cards[0].querySelector("p");
      if (title) title.textContent = "Wallet sign-in";
      if (copy) copy.textContent = "Your verified wallet is the Testnet account identity. Sign once to create or resume access. No duplicate profile is required.";
    }

    const panel = $("registrationPanel");
    if (panel) {
      const eyebrow = panel.querySelector(".eyebrow");
      const heading = panel.querySelector("h2");
      const intro = panel.querySelector("p.muted");
      if (eyebrow) eyebrow.textContent = "WALLET SIGN-IN";
      if (heading) heading.textContent = "Connect your wallet to continue";
      if (intro) intro.textContent = "The wallet is your Testnet identity. Existing accounts resume automatically. A display name is optional and is used only when creating a new account.";
    }

    const input = $("profileNameInput");
    if (input) {
      input.required = false;
      input.placeholder = "Optional display name";
      const label = document.querySelector('label[for="profileNameInput"]');
      if (label) label.textContent = "Display name (optional for a new wallet)";
    }

    const registrationButton = $("registrationForm")?.querySelector('button[type="submit"]');
    if (registrationButton) registrationButton.textContent = "Connect wallet & sign in";

    const accountButton = $("walletConnect");
    if (accountButton) accountButton.textContent = "Sign in with wallet";
  }

  document.addEventListener("DOMContentLoaded", () => {
    updateCopy();

    $("registrationForm")?.addEventListener("submit", (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      void signInWithWallet();
    }, true);

    $("walletConnect")?.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      void signInWithWallet();
    }, true);
  });
})();
