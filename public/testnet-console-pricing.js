(() => {
  const CREDENTIAL_KEY = "geomacro-testnet-api-credential:v1";
  const nativeFetch = window.fetch.bind(window);
  let validatedKey = "";

  const capabilityNames = {
    intelligence_query: "Intelligence query",
    gri_read: "Global Risk Index",
    structural_country_digest: "Country digest",
    structural_corridor_digest: "Corridor digest",
    structural_country_profile: "Country profile",
    structural_corridor_profile: "Corridor profile",
    signed_risk_object: "Signed Risk Object",
    risk_gate_bundle: "Risk Gate bundle",
  };

  function jsonResponse(status, code, message) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: { code, message },
        boundaries: { execution_authorized: false },
      }),
      {
        status,
        headers: { "content-type": "application/json", "cache-control": "no-store" },
      },
    );
  }

  function credentialShape(value) {
    const pair = value && typeof value === "object" ? value : {};
    const apiKey = String(pair.api_key || "").trim();
    const apiSecret = String(pair.api_secret || "").trim();
    if (!/^gmk_test_[A-Za-z0-9_-]{20,}$/.test(apiKey)) return null;
    if (!/^gms_test_[A-Za-z0-9_-]{32,}$/.test(apiSecret)) return null;
    return {
      api_key: apiKey,
      api_secret: apiSecret,
      key_id: String(pair.key_id || apiKey),
      entitlement_grant_id: String(pair.entitlement_grant_id || ""),
    };
  }

  function storedCredential() {
    try {
      return credentialShape(JSON.parse(sessionStorage.getItem(CREDENTIAL_KEY) || "null"));
    } catch {
      return null;
    }
  }

  function parseCredentialPair(text) {
    const value = String(text || "").trim();
    const keyMatch = value.match(/API\s*Key\s*:\s*(gmk_test_[A-Za-z0-9_-]+)/i);
    const secretMatch = value.match(/API\s*Secret\s*:\s*(gms_test_[A-Za-z0-9_-]+)/i);
    if (keyMatch && secretMatch) {
      return credentialShape({ api_key: keyMatch[1], api_secret: secretMatch[1] });
    }
    const compact = value.match(/(gmk_test_[A-Za-z0-9_-]+)\s*[.]\s*(gms_test_[A-Za-z0-9_-]+)/i);
    return compact ? credentialShape({ api_key: compact[1], api_secret: compact[2] }) : null;
  }

  async function responseJson(response) {
    return response.clone().json().catch(() => null);
  }

  async function validateCredential(pair, persist = true) {
    const credential = credentialShape(pair);
    if (!credential) throw new Error("Paste a valid Testnet API Key + API Secret pair.");

    const sessionResponse = await nativeFetch("/api/testnet-tester/me", {
      credentials: "same-origin",
      headers: { accept: "application/json" },
    });
    const sessionPayload = await responseJson(sessionResponse);
    const sessionAccount = sessionPayload?.data;
    if (!sessionResponse.ok || sessionPayload?.ok !== true || sessionAccount?.access_status !== "active") {
      throw new Error("Your wallet-verified Testnet tester session is not active.");
    }

    const accountResponse = await nativeFetch("/api/testnet/account", {
      credentials: "same-origin",
      headers: {
        accept: "application/json",
        authorization: `GeomacroTest ${credential.api_key}.${credential.api_secret}`,
      },
    });
    const accountPayload = await responseJson(accountResponse);
    if (!accountResponse.ok || accountPayload?.ok !== true) {
      throw new Error(
        accountPayload?.error?.message || accountPayload?.error?.code || "The developer credential pair is not authorized.",
      );
    }

    const external = accountPayload.data || {};
    if (external?.principal?.key_id !== credential.api_key) {
      throw new Error("Developer API credential identity mismatch.");
    }
    if (!external?.entitlement?.grant_id || external.entitlement.grant_id !== sessionAccount.entitlement_grant_id) {
      throw new Error("Developer credential entitlement does not match this verified tester session.");
    }

    const verified = {
      ...credential,
      key_id: external.principal.key_id,
      entitlement_grant_id: external.entitlement.grant_id,
    };
    if (persist) sessionStorage.setItem(CREDENTIAL_KEY, JSON.stringify(verified));
    validatedKey = verified.api_key;
    return verified;
  }

  function requestPath(input) {
    try {
      const raw = typeof input === "string" ? input : input?.url;
      return new URL(raw, window.location.href).pathname;
    } catch {
      return "";
    }
  }

  async function credentialForPaidCall() {
    const credential = storedCredential();
    if (!credential) return null;
    if (validatedKey === credential.api_key) return credential;
    return validateCredential(credential, true);
  }

  window.fetch = async (input, init = {}) => {
    if (requestPath(input) !== "/api/testnet-tester/intelligence") {
      return nativeFetch(input, init);
    }

    let credential;
    try {
      credential = await credentialForPaidCall();
    } catch (error) {
      return jsonResponse(401, "TESTNET_DEVELOPER_CREDENTIAL_NOT_READY", error.message || "Developer credential validation failed.");
    }
    if (!credential) {
      return jsonResponse(
        401,
        "TESTNET_API_KEY_SECRET_REQUIRED",
        "Paste and verify the API Key + API Secret created on Testnet Access before requesting a paid intelligence quote.",
      );
    }

    const headers = new Headers(init.headers || {});
    headers.set("accept", "application/json");
    headers.set("content-type", "application/json");
    headers.set("authorization", `GeomacroTest ${credential.api_key}.${credential.api_secret}`);

    const response = await nativeFetch("/api/testnet/intelligence", {
      ...init,
      credentials: "same-origin",
      headers,
    });
    const payload = await responseJson(response);
    const requestBody = (() => {
      try {
        return JSON.parse(String(init.body || "{}"));
      } catch {
        return {};
      }
    })();

    if (response.status === 402 && payload?.error?.code === "TESTNET_PAYMENT_REQUIRED") {
      const binding = payload?.request_binding;
      if (
        binding?.request_id !== requestBody.request_id ||
        !/^[0-9a-f]{64}$/.test(String(binding?.request_fingerprint_sha256 || ""))
      ) {
        return jsonResponse(
          503,
          "TESTNET_REQUEST_BINDING_MISSING",
          "The server did not return a valid exact-request binding. No payment should be sent.",
        );
      }
      return response;
    }

    if (response.ok && payload?.ok === true) {
      if (
        payload?.principal?.key_id !== credential.api_key ||
        payload?.entitlement?.grant_id !== credential.entitlement_grant_id ||
        payload?.request_binding?.request_id !== requestBody.request_id ||
        !/^[0-9a-f]{64}$/.test(String(payload?.request_binding?.request_fingerprint_sha256 || ""))
      ) {
        return jsonResponse(
          409,
          "TESTNET_DELIVERY_BINDING_MISMATCH",
          "The delivered result did not match the verified API credential, entitlement, and exact request binding.",
        );
      }
    }

    return response;
  };

  function credentialPanel() {
    const anchor = document.getElementById("consoleAnchor");
    if (!anchor || document.getElementById("testerDeveloperCredentialBridge")) return;

    const wrap = document.createElement("div");
    wrap.id = "testerDeveloperCredentialBridge";
    wrap.className = "notice";

    const title = document.createElement("strong");
    title.textContent = "Developer API credential";
    const help = document.createElement("p");
    help.className = "muted";
    help.textContent = "Paste the two-line API Key + API Secret copy from Testnet Access. It is kept only in this tab's session storage so reload can verify an already-submitted payment without sending another transfer.";

    const input = document.createElement("textarea");
    input.id = "testerCredentialPair";
    input.placeholder = "API Key: gmk_test_...\nAPI Secret: gms_test_...";
    input.autocomplete = "off";
    input.spellcheck = false;

    const actions = document.createElement("div");
    actions.className = "actions";
    const verify = document.createElement("button");
    verify.type = "button";
    verify.textContent = "Verify credential & continue";
    const clear = document.createElement("button");
    clear.type = "button";
    clear.className = "secondary";
    clear.textContent = "Clear credential";
    const status = document.createElement("div");
    status.className = "okline";
    status.id = "testerCredentialStatus";

    const refreshStatus = () => {
      const current = storedCredential();
      status.textContent = current
        ? `Credential loaded for ${current.key_id}. Paid calls below use /api/testnet/intelligence with this Key + Secret.`
        : "No developer API credential is loaded in this tab yet.";
    };

    verify.addEventListener("click", async () => {
      verify.disabled = true;
      status.textContent = "Validating API Key + Secret against the active Testnet entitlement...";
      try {
        const parsed = parseCredentialPair(input.value);
        const credential = await validateCredential(parsed, true);
        input.value = "";
        status.textContent = `Credential verified for ${credential.key_id}. You can request an HTTP 402 quote below.`;
      } catch (error) {
        status.textContent = error.message || "Developer credential validation failed.";
      } finally {
        verify.disabled = false;
      }
    });

    clear.addEventListener("click", () => {
      sessionStorage.removeItem(CREDENTIAL_KEY);
      validatedKey = "";
      input.value = "";
      refreshStatus();
    });

    actions.append(verify, clear);
    wrap.append(title, help, input, actions, status);
    anchor.appendChild(wrap);
    refreshStatus();
  }

  async function waitForCapabilitySelect(timeoutMs = 2500) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      const select = document.getElementById("testerCapability");
      if (select) return select;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    return null;
  }

  async function syncCanonicalPricing() {
    try {
      const response = await nativeFetch("/api/testnet-tester/config", {
        credentials: "same-origin",
        headers: { accept: "application/json" },
      });
      if (!response.ok) return;

      const payload = await response.json();
      const prices = payload?.data?.capability_prices;
      if (!prices || typeof prices !== "object") return;

      const select = await waitForCapabilitySelect();
      if (!select) return;

      for (const option of Array.from(select.options)) {
        const price = prices[option.value];
        if (!price) continue;
        const credits = Number(price.credits);
        const usdc = Number(price.testnet_usdc);
        if (!Number.isFinite(credits) || !Number.isFinite(usdc)) continue;

        const name = capabilityNames[option.value] || option.value.replaceAll("_", " ");
        option.textContent = `${name} · ${credits} credit${credits === 1 ? "" : "s"} · ${usdc} Testnet USDC`;
      }
    } catch {
      // The payment quote remains the canonical authority if config is temporarily unavailable.
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    credentialPanel();
    void syncCanonicalPricing();
  });
})();
