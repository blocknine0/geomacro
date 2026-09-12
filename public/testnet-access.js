(() => {
  const $ = (id) => document.getElementById(id);
  const text = (id, value) => { const el = $(id); if (el) el.textContent = String(value ?? ""); };
  const show = (id, visible = true) => { const el = $(id); if (el) el.hidden = !visible; };
  const TESTNET_REQUEST_TIMEOUT_MS = 30_000;
  const json = async (url, options = {}) => {
    const isFormData = typeof FormData !== "undefined" && options.body instanceof FormData;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(new DOMException("Request timed out", "TimeoutError")), TESTNET_REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(url, {
        credentials: "same-origin",
        headers: {
          accept: "application/json",
          ...(!isFormData && options.body ? { "content-type": "application/json" } : {}),
          ...(options.headers || {}),
        },
        ...options,
        signal: controller.signal,
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.ok === false) {
        const errorCode = payload?.error || payload?.statusMessage || payload?.message || payload?.data?.error || response.statusText || "Request failed";
        throw new Error(String(errorCode));
      }
      return payload;
    } catch (error) {
      if (controller.signal.aborted) throw new Error("Request timed out. Please try again.");
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  };

  let walletAddress = "";

  function applyPayPerCallCopy() {
    const hero = document.querySelector(".hero p");
    if (hero) hero.textContent = "Create a tester profile, verify one EVM wallet, create an API Key + API Secret, then pay only for each Testnet API call. There is no upfront Testnet USDC activation payment.";
    const cards = document.querySelectorAll(".grid .card");
    if (cards[0]) cards[0].querySelector("p").textContent = "Create a tester profile and verify one EVM wallet to activate Testnet developer access.";
    if (cards[1]) {
      cards[1].querySelector("strong").textContent = "500-credit Testnet cap";
      cards[1].querySelector("p").textContent = "0.5 Testnet USDC per credit, paid per API call. 500 credits is the 30-day usage cap, not an upfront purchase.";
    }
    const steps = document.querySelectorAll(".steps .step");
    if (steps[2]) {
      steps[2].querySelector("b").textContent = "Create key & call API";
      steps[2].querySelector(".muted").textContent = "402 quote → pay only for that call → retry with proof";
    }
    show("paymentPanel", false);
  }

  async function loadAccount() {
    try {
      const payload = await json("/api/testnet-tester/me");
      const account = payload.data;
      const active = account.access_status === "active";
      show("registrationPanel", false);
      show("accountPanel", true);
      text("profileStatus", account.profile_name || "Tester");
      text("walletStatus", account.wallet_verified ? "Verified" : "Pending");
      text("accessStatus", account.access_status || "pending");
      show("walletConnect", !account.wallet_verified);
      show("paymentPanel", false);
      show("developerPanel", active);
      show("feedbackPanel", active);
      if (account.avatar_path) {
        const preview = $("avatarPreview");
        if (preview) {
          preview.src = `/api/testnet-tester/avatar?v=${Date.now()}`;
          preview.hidden = false;
        }
      }
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
        body: JSON.stringify({ profile_name: profileName, terms_version: "testnet-terms-v3-pay-per-call" }),
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
      text("walletActionStatus", "Wallet verified. Developer access is active. Pay only when an API call returns a Testnet 402 quote.");
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

  async function submitTesterFeedback(event) {
    event.preventDefault();
    text("testerFeedbackStatus", "Sending feedback...");
    try {
      const payload = await json("/api/demo/feedback", {
        method: "POST",
        body: JSON.stringify({
          demo_mode: "OTHER",
          tester_type: $("feedbackTesterType").value,
          rating: Number($("feedbackRating").value),
          would_integrate: $("feedbackWouldIntegrate").value === "yes" ? true : $("feedbackWouldIntegrate").value === "no" ? false : null,
          outcome: $("feedbackOutcome").value,
          most_valuable: $("feedbackMostValuable").value.trim(),
          friction: $("feedbackFriction").value.trim(),
          missing_capability: $("feedbackMissingCapability").value.trim(),
        }),
      });
      text("testerFeedbackStatus", payload.message || "Feedback saved. Thank you.");
      $("testerFeedbackForm")?.reset();
    } catch (error) {
      text("testerFeedbackStatus", error.message || "Feedback could not be saved.");
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
    text("developerStatus", "Creating scoped Testnet API key and secret...");
    try {
      const payload = await json("/api/testnet-tester/developer-key", {
        method: "POST",
        body: JSON.stringify({
          label: $("keyLabelInput").value.trim() || "Default test integration",
          integration_type: $("integrationTypeSelect").value,
        }),
      });
      const apiKey = String(payload.data.api_key || "");
      const apiSecret = String(payload.data.api_secret || "");
      text("issuedKey", `API Key: ${apiKey}\nAPI Secret: ${apiSecret}`);
      show("issuedKeyBox", true);
      text("developerStatus", "Copy both values now. No upfront payment is required. Each API call will quote its own Testnet USDC amount.");
      await loadDeveloperKeys();
    } catch (error) {
      text("developerStatus", error.message || "Could not create developer credentials.");
    }
  }

  function bind() {
    $("registrationForm")?.addEventListener("submit", register);
    $("walletConnect")?.addEventListener("click", connectWallet);
    $("avatarForm")?.addEventListener("submit", uploadAvatar);
    $("testerFeedbackForm")?.addEventListener("submit", submitTesterFeedback);
    $("developerKeyForm")?.addEventListener("submit", createDeveloperKey);
    $("copyIssuedKey")?.addEventListener("click", async () => {
      const pair = $("issuedKey")?.textContent || "";
      if (pair) await navigator.clipboard.writeText(pair);
    });
  }

  document.addEventListener("DOMContentLoaded", async () => {
    applyPayPerCallCopy();
    bind();
    await loadAccount();
  });
})();