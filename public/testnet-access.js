(() => {
  const $ = (id) => document.getElementById(id);
  const text = (id, value) => { const el = $(id); if (el) el.textContent = String(value ?? ""); };
  const show = (id, visible = true) => { const el = $(id); if (el) el.hidden = !visible; };
  const json = async (url, options = {}) => {
    const response = await fetch(url, {
      credentials: "same-origin",
      headers: { accept: "application/json", ...(options.body ? { "content-type": "application/json" } : {}), ...(options.headers || {}) },
      ...options,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload?.ok === false) {
      throw new Error(payload?.statusMessage || payload?.message || response.statusText || "Request failed");
    }
    return payload;
  };

  let walletAddress = "";
  let paymentConfig = null;

  async function loadAccount() {
    try {
      const payload = await json("/api/testnet-tester/me");
      const account = payload.data;
      show("registrationPanel", false);
      show("accountPanel", true);
      text("profileStatus", account.profile_name || "Tester");
      text("emailStatus", account.email_verified ? "Verified" : "Pending");
      text("walletStatus", account.wallet_verified ? "Verified" : "Pending");
      text("xStatus", account.x_connected ? "Connected" : "Pending");
      text("discordStatus", account.discord_connected ? "Connected" : "Pending");
      text("accessStatus", account.access_status || "awaiting_payment");
      show("xConnect", !account.x_connected);
      show("discordConnect", !account.discord_connected);
      show("walletConnect", !account.wallet_verified);
      show("paymentPanel", account.registration_status === "complete");
      show("developerPanel", account.access_status === "active");
      if (account.registration_status === "complete") await loadPaymentConfig();
      if (account.access_status === "active") await loadDeveloperKeys();
      return account;
    } catch {
      show("registrationPanel", true);
      show("accountPanel", false);
      show("paymentPanel", false);
      show("developerPanel", false);
      return null;
    }
  }

  async function verifyEmailFromUrl() {
    const params = new URLSearchParams(location.search);
    const token = params.get("verify_email");
    if (!token) return;
    try {
      await json("/api/testnet-tester/email-verify", { method: "POST", body: JSON.stringify({ token }) });
      text("globalStatus", "Email verified.");
      params.delete("verify_email");
      history.replaceState({}, "", `${location.pathname}${params.toString() ? `?${params}` : ""}`);
    } catch (error) {
      text("globalStatus", error.message || "Email verification failed.");
    }
  }

  async function register(event) {
    event.preventDefault();
    const email = $("emailInput").value.trim();
    const profileName = $("profileNameInput").value.trim();
    text("registrationStatus", "Creating account and sending verification email...");
    try {
      await json("/api/testnet-tester/register", {
        method: "POST",
        body: JSON.stringify({ email, profile_name: profileName, terms_version: "testnet-terms-v1" }),
      });
      text("registrationStatus", "Account created. Check your email, then return here.");
      await loadAccount();
    } catch (error) {
      text("registrationStatus", error.message || "Registration failed.");
    }
  }

  async function connectWallet() {
    if (!window.ethereum?.request) {
      text("walletActionStatus", "No injected EVM wallet detected.");
      return;
    }
    try {
      const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
      walletAddress = String(accounts?.[0] || "");
      if (!walletAddress) throw new Error("Wallet account unavailable");
      const challenge = await json("/api/testnet-tester/wallet-challenge", {
        method: "POST",
        body: JSON.stringify({ wallet_address: walletAddress }),
      });
      const message = challenge.data.message;
      const signature = await window.ethereum.request({
        method: "personal_sign",
        params: [message, walletAddress],
      });
      await json("/api/testnet-tester/wallet-verify", {
        method: "POST",
        body: JSON.stringify({
          wallet_address: walletAddress,
          nonce: challenge.data.nonce,
          message,
          signature,
        }),
      });
      text("walletActionStatus", "Wallet verified.");
      await loadAccount();
    } catch (error) {
      text("walletActionStatus", error.message || "Wallet verification failed.");
    }
  }

  async function loadPaymentConfig() {
    try {
      const payload = await json("/api/testnet-tester/config");
      paymentConfig = payload.data;
      text("receiverAddress", paymentConfig.receiver_address);
      const select = $("chainSelect");
      if (select) {
        select.innerHTML = "";
        paymentConfig.chains.forEach((chain) => {
          const option = document.createElement("option");
          option.value = chain.key;
          option.textContent = `${chain.name} · ${chain.payment_asset}`;
          select.appendChild(option);
        });
      }
    } catch (error) {
      text("paymentStatus", error.message || "Payment configuration is not ready yet.");
    }
  }

  async function claimPayment(event) {
    event.preventDefault();
    const chainKey = $("chainSelect").value;
    const txHash = $("txHashInput").value.trim();
    if (!walletAddress && window.ethereum?.request) {
      const accounts = await window.ethereum.request({ method: "eth_accounts" });
      walletAddress = String(accounts?.[0] || "");
    }
    if (!walletAddress) {
      text("paymentStatus", "Connect the same verified wallet before claiming payment.");
      return;
    }
    text("paymentStatus", "Verifying Testnet USDC transfer onchain...");
    try {
      const payload = await json("/api/testnet-tester/payment-claim", {
        method: "POST",
        body: JSON.stringify({ chain_key: chainKey, tx_hash: txHash, payer_address: walletAddress }),
      });
      text("paymentStatus", `Access active. ${payload.data.credits_granted} credits granted.`);
      await loadAccount();
    } catch (error) {
      text("paymentStatus", error.message || "Payment verification failed.");
    }
  }

  async function loadDeveloperKeys() {
    try {
      const payload = await json("/api/testnet-tester/developer-keys");
      const list = $("developerKeyList");
      if (!list) return;
      list.innerHTML = "";
      (payload.data || []).forEach((key) => {
        const row = document.createElement("div");
        row.className = "key-row";
        const meta = document.createElement("div");
        const title = document.createElement("strong");
        title.textContent = key.label || key.key_id || "Test key";
        const detail = document.createElement("span");
        detail.textContent = `${key.key_id || ""} · ${key.integration_type || "product_api"} · ${key.enabled ? "active" : "revoked"}`;
        meta.append(title, detail);
        row.appendChild(meta);
        if (key.enabled) {
          const button = document.createElement("button");
          button.type = "button";
          button.textContent = "Revoke";
          button.addEventListener("click", async () => {
            await json("/api/testnet-tester/developer-key-revoke", {
              method: "POST",
              body: JSON.stringify({ credential_id: key.credential_id }),
            });
            await loadDeveloperKeys();
          });
          row.appendChild(button);
        }
        list.appendChild(row);
      });
    } catch (error) {
      text("developerStatus", error.message || "Could not load developer keys.");
    }
  }

  async function createDeveloperKey(event) {
    event.preventDefault();
    text("developerStatus", "Creating scoped Testnet API key...");
    try {
      const payload = await json("/api/testnet-tester/developer-key", {
        method: "POST",
        body: JSON.stringify({
          label: $("keyLabelInput").value.trim() || "Default test integration",
          integration_type: $("integrationTypeSelect").value,
        }),
      });
      const key = payload.data.api_key;
      text("issuedKey", key);
      show("issuedKeyBox", true);
      text("developerStatus", "Copy this key now. It will not be shown again.");
      await loadDeveloperKeys();
    } catch (error) {
      text("developerStatus", error.message || "Could not create developer key.");
    }
  }

  function bind() {
    $("registrationForm")?.addEventListener("submit", register);
    $("walletConnect")?.addEventListener("click", connectWallet);
    $("paymentForm")?.addEventListener("submit", claimPayment);
    $("developerKeyForm")?.addEventListener("submit", createDeveloperKey);
    $("xConnect")?.addEventListener("click", () => { location.href = "/api/testnet-tester/oauth/x/start"; });
    $("discordConnect")?.addEventListener("click", () => { location.href = "/api/testnet-tester/oauth/discord/start"; });
    $("copyReceiver")?.addEventListener("click", async () => {
      if (paymentConfig?.receiver_address) await navigator.clipboard.writeText(paymentConfig.receiver_address);
    });
    $("copyIssuedKey")?.addEventListener("click", async () => {
      const key = $("issuedKey")?.textContent || "";
      if (key) await navigator.clipboard.writeText(key);
    });
  }

  document.addEventListener("DOMContentLoaded", async () => {
    bind();
    await loadAccount();
    await verifyEmailFromUrl();
    await loadAccount();
  });
})();
