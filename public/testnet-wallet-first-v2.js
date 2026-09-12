(() => {
  const AUTH_FLOW = "wallet-first-v2";
  const REQUEST_TIMEOUT_MS = 30_000;
  const $ = (id) => document.getElementById(id);
  const announcedWallets = [];
  let signingIn = false;

  window.__GEOMACRO_TESTNET_AUTH_FLOW__ = AUTH_FLOW;

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
    // Legacy injected-wallet fallback is handled below.
  }

  function walletProvider() {
    if (announcedWallets.length > 0) return announcedWallets[0];
    if (window.ethereum?.request) return { provider: window.ethereum, name: "EVM wallet" };
    return null;
  }

  function walletChainId(value) {
    const raw = String(value ?? "").trim();
    const parsed = /^0x[0-9a-f]+$/i.test(raw) ? Number.parseInt(raw, 16) : Number(raw);
    if (!Number.isSafeInteger(parsed) || parsed <= 0) throw new Error("TESTNET_SIGNIN_CHAIN_INVALID");
    return parsed;
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
    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(new DOMException("Request timed out", "TimeoutError")),
      REQUEST_TIMEOUT_MS,
    );
    try {
      const response = await fetch(url, {
        credentials: "same-origin",
        headers: {
          accept: "application/json",
          ...(options.body ? { "content-type": "application/json" } : {}),
          ...(options.headers || {}),
        },
        ...options,
        signal: controller.signal,
      });
      const payload = await response.json().catch(() => null);
      if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        throw new Error("TESTNET_AUTH_RESPONSE_INVALID");
      }
      if (!response.ok || payload.ok === false) {
        const nested = payload && typeof payload.data === "object" ? payload.data : {};
        const message = firstString(
          payload.error,
          payload?.error?.message,
          payload?.error?.code,
          payload.statusMessage,
          payload.message,
          nested?.error,
          nested?.statusMessage,
          nested?.message,
          response.statusText,
        );
        const error = new Error(message || `Request failed (${response.status})`);
        error.status = response.status;
        throw error;
      }
      return payload;
    } catch (error) {
      if (controller.signal.aborted) throw new Error("TESTNET_AUTH_TIMEOUT");
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
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
      TESTNET_SIGNIN_CHAIN_INVALID: "The wallet returned an invalid EVM chain ID. Switch to a normal EVM network and try again.",
      TESTNET_SIGNIN_CHALLENGE_EXPIRED: "The sign-in request expired. Try again.",
      TESTNET_SIGNIN_CHALLENGE_USED_OR_EXPIRED: "That sign-in request was already used or expired. Try again.",
      TESTNET_SIGNIN_MESSAGE_MISMATCH: "The wallet sign-in message did not match the server challenge.",
      TESTNET_WALLET_SIGNATURE_INVALID: "The wallet signature could not be verified.",
      TESTNET_PROFILE_NOT_ACTIVE: "This Testnet wallet account is suspended or revoked.",
      TESTNET_AUTH_ORIGIN_REQUIRED: "Open geomacro.live/testnet-access directly in a normal browser tab and try again.",
      TESTNET_AUTH_ORIGIN_FORBIDDEN: "Wallet sign-in is allowed only from the Geomacro Testnet Access page.",
      TESTNET_AUTH_RESPONSE_INVALID: "The wallet sign-in service returned an invalid response. Reload and try again.",
      TESTNET_AUTH_TIMEOUT: "Wallet sign-in timed out. No transaction was sent. Try again.",
      INVALID_WALLET_ADDRESS: "The connected wallet address is invalid.",
      INVALID_PROFILE_NAME: "Display name must be between 2 and 64 characters.",
    };
    if (error?.status === 404) {
      return "Wallet-first authentication is not deployed on this hosted version yet. Publish the latest Geomacro build and retry.";
    }
    return messages[code] || code || "Wallet sign-in failed.";
  }

  function optionalProfileName() {
    const input = $("profileNameInput");
    const supplied = String(input?.value || "").trim();
    if (supplied) return supplied;
    const current = String($("profileStatus")?.textContent || "").trim();
    return current && current !== "Tester" ? current : "";
  }

  function updateCopy() {
    document.body?.setAttribute("data-testnet-auth-flow", AUTH_FLOW);

    const hero = document.querySelector(".hero p");
    if (hero) {
      hero.textContent = "Connect one EVM wallet and sign a one-time message. Existing wallets resume the same Testnet developer account automatically; new wallets create one only after signature verification. Then create API credentials and pay only per API call.";
    }

    const cards = document.querySelectorAll(".grid .card");
    if (cards[0]) {
      const title = cards[0].querySelector("strong");
      const copy = cards[0].querySelector("p");
      if (title) title.textContent = "Wallet sign-in";
      if (copy) copy.textContent = "Your wallet is the Testnet identity. Sign once to create or resume access without duplicate profiles.";
    }

    const panel = $("registrationPanel");
    if (panel) {
      const eyebrow = panel.querySelector(".eyebrow");
      const heading = panel.querySelector("h2");
      const intro = panel.querySelector("p.muted");
      if (eyebrow) eyebrow.textContent = "WALLET SIGN-IN";
      if (heading) heading.textContent = "Connect your wallet to continue";
      if (intro) intro.textContent = "Your wallet is the Testnet identity. Existing accounts resume automatically. A display name is optional and is used only when creating a new account.";
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

    const legacyError = String($("walletActionStatus")?.textContent || "").trim();
    if (legacyError === "TESTNET_WALLET_ALREADY_REGISTERED") {
      $("walletActionStatus").textContent = "This wallet already has a Testnet developer account. Sign in with the wallet to resume it.";
    }
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
      const chainId = walletChainId(await wallet.provider.request({ method: "eth_chainId" }));

      setStatus("Preparing a one-time EIP-4361 wallet sign-in message...");
      const challenge = await json("/api/testnet-tester/auth-challenge", {
        method: "POST",
        body: JSON.stringify({ wallet_address: walletAddress, chain_id: chainId }),
      });
      const data = challenge.data || {};
      if (!data.message || !data.nonce || !data.issued_at || Number(data.chain_id) !== chainId) {
        throw new Error("TESTNET_SIGNIN_CHALLENGE_FAILED");
      }

      setStatus("Approve the sign-in message in your wallet. This is not a transaction and cannot move funds.");
      const signature = await personalSign(wallet.provider, String(data.message), walletAddress);

      setStatus("Verifying wallet and opening your Testnet developer account...");
      const verified = await json("/api/testnet-tester/auth-verify", {
        method: "POST",
        body: JSON.stringify({
          wallet_address: walletAddress,
          chain_id: data.chain_id,
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

  function captureWalletFirst(event) {
    event.preventDefault();
    event.stopImmediatePropagation();
    void signInWithWallet();
  }

  // Defer scripts execute after parsing, so install the wallet-first capture
  // handlers immediately, before the legacy DOMContentLoaded binder runs.
  updateCopy();
  $("registrationForm")?.addEventListener("submit", captureWalletFirst, true);
  $("walletConnect")?.addEventListener("click", captureWalletFirst, true);

  document.addEventListener("DOMContentLoaded", () => {
    updateCopy();
    $("registrationForm")?.addEventListener("submit", captureWalletFirst, true);
    $("walletConnect")?.addEventListener("click", captureWalletFirst, true);
  }, { once: true });
})();
