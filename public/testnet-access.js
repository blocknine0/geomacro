(() => {
  const $ = (id) => document.getElementById(id);
  const text = (id, value) => {
    const el = $(id);
    if (el) el.textContent = String(value ?? "");
  };
  const show = (id, visible = true) => {
    const el = $(id);
    if (el) el.hidden = !visible;
  };
  const TESTNET_REQUEST_TIMEOUT_MS = 30_000;

  function firstString(...values) {
    for (const value of values) {
      if (typeof value === "string" && value.trim()) return value.trim();
    }
    return "";
  }

  function browserErrorMessage(error, fallback = "Request failed") {
    if (error?.code === 4001) return "Wallet request was cancelled.";
    return firstString(error?.message, error?.shortMessage, error?.reason) || fallback;
  }

  const json = async (url, options = {}) => {
    const isFormData = typeof FormData !== "undefined" && options.body instanceof FormData;
    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(new DOMException("Request timed out", "TimeoutError")),
      TESTNET_REQUEST_TIMEOUT_MS,
    );

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

      const payload = await response.json().catch(() => null);
      if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        throw new Error("The server returned an invalid API response. Reload the page and try again.");
      }
      if (!response.ok || payload?.ok === false) {
        const nested = payload && typeof payload.data === "object" ? payload.data : {};
        const message = firstString(
          payload?.error,
          payload?.error?.message,
          payload?.error?.code,
          payload?.statusMessage,
          payload?.message,
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
      if (controller.signal.aborted) throw new Error("Request timed out. Please try again.");
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  };

  let walletAddress = "";
  let registrationPending = false;
  const announcedWallets = [];

  function rememberWalletProvider(detail) {
    const provider = detail?.provider;
    if (!provider?.request) return;
    if (announcedWallets.some((entry) => entry.provider === provider)) return;
    announcedWallets.push({
      provider,
      name: firstString(detail?.info?.name) || "EVM wallet",
    });
  }

  window.addEventListener("eip6963:announceProvider", (event) => rememberWalletProvider(event.detail));
  try {
    window.dispatchEvent(new Event("eip6963:requestProvider"));
  } catch {
    // Legacy injected wallets are handled by window.ethereum below.
  }

  function injectedWalletProvider() {
    if (announcedWallets.length > 0) return announcedWallets[0];
    if (window.ethereum?.request) return { provider: window.ethereum, name: "EVM wallet" };
    return null;
  }

  function utf8ToHex(value) {
    const bytes = new TextEncoder().encode(String(value));
    return `0x${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
  }

  async function personalSign(provider, message, address) {
    const hexMessage = utf8ToHex(message);
    try {
      return await provider.request({
        method: "personal_sign",
        params: [hexMessage, address],
      });
    } catch (error) {
      if (error?.code === 4001) throw error;
      const messageText = browserErrorMessage(error, "");
      if (!/param|argument|address|data|invalid/i.test(messageText)) throw error;
      return provider.request({
        method: "personal_sign",
        params: [address, hexMessage],
      });
    }
  }

  function clearBooleanErrorArtifact(id) {
    const el = $(id);
    if (!el) return;
    const value = String(el.textContent || "").trim().toLowerCase();
    if (value === "true" || value === "false") el.textContent = "";
  }

  function applyPayPerCallCopy() {
    const hero = document.querySelector(".hero p");
    if (hero) {
      hero.textContent =
        "Create a tester profile, verify one EVM wallet, create an API Key + API Secret, then pay only for each Testnet API call. There is no upfront Testnet USDC activation payment.";
    }
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
      text("globalStatus", "");
      show("registrationPanel", false);
      show("accountPanel", true);
      text("profileStatus", account.profile_name || "Tester");
      text("walletStatus", account.wallet_verified ? "Verified" : "Pending");
      text("accessStatus", account.access_status || "pending");
      // A signature can succeed before entitlement provisioning fails. Allow
      // another verification attempt instead of stranding the tester here.
      show("walletConnect", !account.wallet_verified || !active);
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
      if (error?.status !== 401) text("globalStatus", browserErrorMessage(error));
      else text("globalStatus", "");
      return null;
    }
  }

  async function register(event) {
    event.preventDefault();
    if (registrationPending) return;
    registrationPending = true;
    const profileName = $("profileNameInput").value.trim();
    text("registrationStatus", "Creating tester profile...");
    try {
      await json("/api/testnet-tester/register", {
        method: "POST",
        body: JSON.stringify({
          profile_name: profileName,
          terms_version: "testnet-terms-v3-pay-per-call",
        }),
      });
      text("registrationStatus", "Profile created. Connect and verify your wallet next.");
      await loadAccount();
    } catch (error) {
      text("registrationStatus", browserErrorMessage(error, "Registration failed."));
    } finally {
      registrationPending = false;
    }
  }

  async function connectWallet() {
    const button = $("walletConnect");
    const wallet = injectedWalletProvider();
    if (!wallet) {
      const embedded = (() => {
        try {
          return window.top !== window.self;
        } catch {
          return true;
        }
      })();
      text(
        "walletActionStatus",
        embedded
          ? "Wallet extensions are usually unavailable inside embedded previews. Open https://geomacro.live/testnet-access directly in a normal browser tab with your EVM wallet extension enabled."
          : "No injected EVM wallet detected. Enable Rabby, MetaMask or another EIP-1193 wallet extension and reload this page.",
      );
      return;
    }

    if (button) button.disabled = true;
    text("walletActionStatus", `Opening ${wallet.name}...`);

    try {
      const accounts = await wallet.provider.request({ method: "eth_requestAccounts" });
      walletAddress = String(accounts?.[0] || "").trim();
      if (!/^0x[0-9a-fA-F]{40}$/.test(walletAddress)) throw new Error("Wallet account unavailable");

      text("walletActionStatus", "Wallet connected. Preparing the verification message...");
      const challenge = await json("/api/testnet-tester/wallet-challenge", {
        method: "POST",
        body: JSON.stringify({ wallet_address: walletAddress }),
      });

      const challengeMessage = String(challenge?.data?.message || "");
      const nonce = String(challenge?.data?.nonce || "");
      if (!challengeMessage || !nonce) throw new Error("Wallet verification challenge is incomplete.");

      text("walletActionStatus", "Approve the message signature in your wallet. This does not authorize funds or a transaction.");
      const signature = await personalSign(wallet.provider, challengeMessage, walletAddress);

      text("walletActionStatus", "Signature received. Verifying wallet...");
      await json("/api/testnet-tester/wallet-verify", {
        method: "POST",
        body: JSON.stringify({
          wallet_address: walletAddress,
          nonce,
          message: challengeMessage,
          signature,
        }),
      });

      text("walletActionStatus", "Wallet verified. Developer access is active. Loading API credential tools...");
      await loadAccount();
    } catch (error) {
      text("walletActionStatus", browserErrorMessage(error, "Wallet verification failed."));
    } finally {
      if (button) button.disabled = false;
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
      text("avatarStatus", browserErrorMessage(error, "Profile image upload failed."));
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
          would_integrate:
            $("feedbackWouldIntegrate").value === "yes"
              ? true
              : $("feedbackWouldIntegrate").value === "no"
                ? false
                : null,
          outcome: $("feedbackOutcome").value,
          most_valuable: $("feedbackMostValuable").value.trim(),
          friction: $("feedbackFriction").value.trim(),
          missing_capability: $("feedbackMissingCapability").value.trim(),
        }),
      });
      text("testerFeedbackStatus", payload.message || "Feedback saved. Thank you.");
      $("testerFeedbackForm")?.reset();
    } catch (error) {
      text("testerFeedbackStatus", browserErrorMessage(error, "Feedback could not be saved."));
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
            try {
              await json("/api/testnet-tester/developer-key-revoke", {
                method: "POST",
                body: JSON.stringify({ credential_id: key.credential_id }),
              });
              await loadDeveloperKeys();
            } catch (error) {
              text("developerStatus", browserErrorMessage(error, "Could not revoke developer credentials."));
            }
          });
          row.appendChild(button);
        }
        list.appendChild(row);
      });
    } catch (error) {
      text("developerStatus", browserErrorMessage(error, "Could not load developer keys."));
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
      text(
        "developerStatus",
        "Copy both values now. No upfront payment is required. Each API call will quote its own Testnet USDC amount.",
      );
      await loadDeveloperKeys();
    } catch (error) {
      text("developerStatus", browserErrorMessage(error, "Could not create developer credentials."));
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
    clearBooleanErrorArtifact("globalStatus");
    clearBooleanErrorArtifact("walletActionStatus");
    await loadAccount();
  });
})();
