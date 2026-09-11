(() => {
  const $ = (id) => document.getElementById(id);
  const text = (id, value) => { const el = $(id); if (el) el.textContent = String(value ?? ""); };
  const show = (id, visible = true) => { const el = $(id); if (el) el.hidden = !visible; };
  const json = async (url, options = {}) => {
    const isFormData = typeof FormData !== "undefined" && options.body instanceof FormData;
    const response = await fetch(url, {
      credentials: "same-origin",
      headers: {
        accept: "application/json",
        ...(!isFormData && options.body ? { "content-type": "application/json" } : {}),
        ...(options.headers || {}),
      },
      ...options,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload?.ok === false) {
      const errorCode = payload?.error || payload?.statusMessage || payload?.message || payload?.data?.error || response.statusText || "Request failed";
      throw new Error(String(errorCode));
    }
    return payload;
  };

  let walletAddress = "";
  let paymentConfig = null;

  async function loadAccount() {
    try {
      const payload = await json("/api/testnet-tester/me");
      const account = payload.data;
      const active = account.access_status === "active";
      show("registrationPanel", false);
      show("accountPanel", true);
      text("profileStatus", account.profile_name || "Tester");
      text("walletStatus", account.wallet_verified ? "Verified" : "Pending");
      text("accessStatus", account.access_status || "awaiting_payment");
      show("walletConnect", !account.wallet_verified);
      show("paymentPanel", account.registration_status === "complete" && !active);
      show("developerPanel", active);
      show("feedbackPanel", active);
      if (account.avatar_path) {
        const preview = $("avatarPreview");
        if (preview) {
          preview.src = `/api/testnet-tester/avatar?v=${Date.now()}`;
          preview.hidden = false;
        }
      }
      if (account.registration_status === "complete" && !active) await loadPaymentConfig();
      if (active) await loadDeveloperKeys();
      return account;
    } catch (error) {
      show("registrationPanel", true);
      show("accountPanel", false);
      show("paymentPanel", false);
      show("developerPanel", false);
      show("feedbackPanel", false);
      if (error?.message && !/Tester session/i.test(error.message)) text("globalStatus", error.message);
      return null;
    }
  }

  async function register(event) {
    event.preventDefault();
    const profileName = $("profileNameInput").value.trim();
    text("registrationStatus", "Creating tester profile...");
    try {
      await json("/api/testnet-tester/register", {
        method: "POST",
        body: JSON.stringify({ profile_name: profileName, terms_version: "testnet-terms-v2-wallet-only" }),
      });
      text("registrationStatus", "Profile created. Connect and verify your wallet next.");
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
      const signature = await window.ethereum.request({ method: "personal_sign", params: [message, walletAddress] });
      await json("/api/testnet-tester/wallet-verify", {
        method: "POST",
        body: JSON.stringify({ wallet_address: walletAddress, nonce: challenge.data.nonce, message, signature }),
      });
      text("walletActionStatus", "Wallet verified. You can now activate the 500-credit Testnet quota.");
      await loadAccount();
    } catch (error) {
      text("walletActionStatus", error.message || "Wallet verification failed.");
    }
  }

  async function uploadAvatar(event) {
    event.preventDefault();
    const file = $("avatarInput")?.files?.[0];
    if (!file) return text("avatarStatus", "Choose a PNG, JPEG or WebP image first.");
    if (file.size > 2 * 1024 * 1024) return text("avatarStatus", "Profile image must be 2 MB or smaller.");
    const data = new FormData();
    data.append("avatar", file);
    text("avatarStatus", "Uploading profile image...");
    try {
      await json("/api/testnet-tester/avatar", { method: "POST", body: data });
      text("avatarStatus", "Profile image updated.");
      await loadAccount();
    } catch (error) {
      text("avatarStatus", error.message || "Profile image upload failed.");
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
      text("paymentStatus", payload.data.idempotent_replay
        ? "This payment was already verified. No extra credits were granted."
        : "Access active. Fixed 500-credit tester quota granted.");
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
            await json("/api/testnet-tester/developer-key-revoke", { method: "POST", body: JSON.stringify({ credential_id: key.credential_id }) });
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
      text("issuedKey", payload.data.api_key);
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
    $("avatarForm")?.addEventListener("submit", uploadAvatar);
    $("paymentForm")?.addEventListener("submit", claimPayment);
    $("developerKeyForm")?.addEventListener("submit", createDeveloperKey);
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
  });
})();
