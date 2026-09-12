(() => {
  const el = (tag, props = {}, children = []) => {
    const node = document.createElement(tag);
    Object.entries(props).forEach(([key, value]) => {
      if (key === "className") node.className = value;
      else if (key === "text") node.textContent = value;
      else node.setAttribute(key, value);
    });
    for (const child of children) node.appendChild(child);
    return node;
  };

  function makeField(labelText, control, full = false) {
    const wrap = el("div", { className: `field${full ? " full" : ""}` });
    wrap.appendChild(el("label", { text: labelText }));
    wrap.appendChild(control);
    return wrap;
  }

  async function requestJson(url, options = {}) {
    const response = await fetch(url, {
      credentials: "same-origin",
      headers: {
        accept: "application/json",
        ...(options.body ? { "content-type": "application/json" } : {}),
        ...(options.headers || {}),
      },
      ...options,
      signal: AbortSignal.timeout(30_000),
    });
    const payload = await response.json().catch(() => null);
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      throw new Error("The server returned an invalid API response. Retry the same request; do not send another payment.");
    }
    return { response, payload };
  }

  async function requireJson(url, options = {}) {
    const { response, payload } = await requestJson(url, options);
    if (!response.ok || payload?.ok === false) {
      throw new Error(
        payload?.error?.message ||
          payload?.error?.code ||
          payload?.statusMessage ||
          payload?.message ||
          response.statusText ||
          "Request failed",
      );
    }
    return payload;
  }

  function randomRequestId() {
    return `web-${crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`}`;
  }

  function erc20TransferData(recipient, amountAtomic) {
    const to = String(recipient).replace(/^0x/i, "").toLowerCase().padStart(64, "0");
    const amount = BigInt(String(amountAtomic)).toString(16).padStart(64, "0");
    return `0xa9059cbb${to}${amount}`;
  }

  async function waitForReceipt(txHash, timeoutMs = 75_000) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      const receipt = await window.ethereum.request({
        method: "eth_getTransactionReceipt",
        params: [txHash],
      });
      if (receipt?.blockNumber) {
        if (receipt.status && BigInt(receipt.status) !== 1n) {
          throw new Error("The Testnet USDC transaction reverted.");
        }
        return receipt;
      }
      await new Promise((resolve) => setTimeout(resolve, 2_000));
    }
    throw new Error("The Testnet transaction is still pending. Retry after it confirms.");
  }

  function subjectLabel(request) {
    const subject = request.subject;
    if (!subject || subject.type === "global") return "Global";
    if (subject.type === "country") return subject.country_iso3;
    return `${subject.origin_country_iso3}>${subject.destination_country_iso3}`;
  }

  function resultSummary(result, request) {
    const data = result?.data || {};
    if (request.capability === "intelligence_query") return data.summary || "Geomacro intelligence query";
    if (request.capability === "gri_read") return `Global Risk Index ${data.display_score ?? ""}/100`;
    if (request.capability === "signed_risk_object") {
      return `Signed Risk Object · ${data.risk_object?.risk?.score ?? ""}/100`;
    }
    if (request.capability === "risk_gate_bundle") {
      return `Risk Gate · ${data.risk_gate?.decision ?? data.risk_gate?.action ?? "decision context"}`;
    }
    return `Geomacro ${request.capability.replaceAll("_", " ")}`;
  }

  async function boot() {
    let account;
    try {
      account = (await requireJson("/api/testnet-tester/me")).data;
    } catch {
      return;
    }
    if (account?.access_status !== "active") return;
    if (document.getElementById("testerConsolePanel")) return;

    let lastResult = null;
    let lastRequest = null;
    let lastShare = null;
    let pendingRequest = null;
    let pendingQuote = null;
    let pendingPayment = null;
    let busy = false;
    const recoveryKey = `geomacro-testnet-payment:${account.entitlement_grant_id}`;

    function saveRecovery() {
      // Session-scoped recovery contains no API credentials or session tokens.
      sessionStorage.setItem(recoveryKey, JSON.stringify({
        request: pendingRequest, quote: pendingQuote, payment: pendingPayment,
      }));
    }

    const panel = el("section", { className: "panel", id: "testerConsolePanel" });
    panel.appendChild(el("div", { className: "eyebrow", text: "TRY GEOMACRO" }));
    panel.appendChild(el("h2", { text: "Run a pay-per-call Testnet intelligence request" }));
    panel.appendChild(
      el("p", {
        className: "muted",
        text: "All capabilities below use the same canonical Geomacro intelligence state. No upfront Testnet USDC payment is required.",
      }),
    );

    const capability = el("select", { id: "testerCapability" });
    [
      ["intelligence_query", "Intelligence query · 1 credit · 0.5 Testnet USDC"],
      ["gri_read", "Global Risk Index · 1 credit · 0.5 Testnet USDC"],
      ["structural_country_digest", "Country digest · 3 credits · 1.5 Testnet USDC"],
      ["structural_corridor_digest", "Corridor digest · 5 credits · 2.5 Testnet USDC"],
      ["structural_country_profile", "Country profile · 8 credits · 4 Testnet USDC"],
      ["structural_corridor_profile", "Corridor profile · 12 credits · 6 Testnet USDC"],
      ["signed_risk_object", "Signed Risk Object · 10 credits · 5 Testnet USDC"],
      ["risk_gate_bundle", "Risk Gate bundle · 15 credits · 7.5 Testnet USDC"],
    ].forEach(([value, label]) => capability.appendChild(el("option", { value, text: label })));

    const question = el("textarea", {
      id: "testerQuestion",
      maxlength: "500",
      placeholder: "What geopolitical or macro risk changed recently?",
    });
    const subjectType = el("select", { id: "testerSubjectType" });
    subjectType.append(
      el("option", { value: "country", text: "Country" }),
      el("option", { value: "corridor", text: "Corridor" }),
    );
    const origin = el("input", { id: "testerOrigin", maxlength: "3", value: "IND" });
    const destination = el("input", { id: "testerDestination", maxlength: "3", value: "USA" });
    const policy = el("select", { id: "testerPolicy" });
    ["balanced", "cautious", "strict"].forEach((value) =>
      policy.appendChild(el("option", { value, text: value[0].toUpperCase() + value.slice(1) })),
    );
    const actionType = el("select", { id: "testerActionType" });
    [
      ["agent_payment", "Agent payment"],
      ["treasury_payment", "Treasury payment"],
      ["vendor_payment", "Vendor payment"],
      ["exposure_review", "Exposure review"],
    ].forEach(([value, label]) => actionType.appendChild(el("option", { value, text: label })));
    const amount = el("input", { id: "testerAmount", type: "number", min: "0.000001", step: "any", placeholder: "Optional USDC amount" });

    const form = el("form", { className: "form-grid", id: "testerConsoleForm" });
    const capabilityField = makeField("Capability", capability, true);
    const questionField = makeField("Question", question, true);
    const subjectTypeField = makeField("Risk subject", subjectType);
    const originField = makeField("Country / origin ISO3", origin);
    const destinationField = makeField("Destination ISO3", destination);
    const policyField = makeField("Risk Gate policy", policy);
    const actionField = makeField("Action context", actionType);
    const amountField = makeField("Amount (optional)", amount);
    form.append(
      capabilityField,
      questionField,
      subjectTypeField,
      originField,
      destinationField,
      policyField,
      actionField,
      amountField,
    );
    const runWrap = el("div", { className: "field full" });
    const runButton = el("button", { type: "submit", text: "Get price quote" });
    runWrap.appendChild(runButton);
    form.appendChild(runWrap);
    panel.appendChild(form);

    const status = el("div", { className: "okline", id: "testerConsoleStatus" });
    const credits = el("div", {
      className: "notice",
      text: "500 credits is your 30-day usage cap. Credits are consumed only after the matching Testnet USDC call payment is verified.",
    });

    const paymentBox = el("div", { className: "notice", id: "testerPaymentBox" });
    paymentBox.hidden = true;
    const quoteText = el("div", { id: "testerQuoteText" });
    const chainSelect = el("select", { id: "testerPaymentChain" });
    chainSelect.style.marginTop = "10px";
    const payButton = el("button", { type: "button", text: "Pay Testnet USDC & retry" });
    payButton.style.marginTop = "10px";
    paymentBox.append(quoteText, chainSelect, payButton);

    const output = el("pre", { id: "testerConsoleOutput" });
    output.style.whiteSpace = "pre-wrap";
    output.style.maxHeight = "520px";
    output.style.overflow = "auto";
    output.style.background = "#080d14";
    output.style.border = "1px solid #273348";
    output.style.borderRadius = "12px";
    output.style.padding = "14px";
    output.style.font = "12px ui-monospace,monospace";
    output.hidden = true;

    const actions = el("div", { className: "actions" });
    const createShare = el("button", { type: "button", className: "secondary", text: "Create share card" });
    const shareX = el("button", { type: "button", className: "secondary", text: "Share result on X" });
    createShare.hidden = true;
    shareX.hidden = true;
    actions.append(createShare, shareX);

    panel.append(status, credits, paymentBox, output, actions);
    const anchor = document.getElementById("consoleAnchor");
    if (anchor?.parentNode) anchor.parentNode.insertBefore(panel, anchor.nextSibling);
    else document.querySelector("main")?.appendChild(panel);

    function syncFields() {
      if (busy || pendingPayment) return;
      const value = capability.value;
      const isQuery = value === "intelligence_query";
      const isGri = value === "gri_read";
      const isSigned = value === "signed_risk_object";
      const isGate = value === "risk_gate_bundle";
      const forcedCountry = value.includes("country");
      const forcedCorridor = value.includes("corridor");
      const hasSubject = !isQuery && !isGri;
      const chosenType = forcedCountry ? "country" : forcedCorridor ? "corridor" : subjectType.value;

      questionField.hidden = !isQuery;
      subjectTypeField.hidden = !(isSigned || isGate);
      originField.hidden = !hasSubject;
      destinationField.hidden = !hasSubject || chosenType !== "corridor";
      policyField.hidden = !isGate;
      actionField.hidden = !isGate;
      amountField.hidden = !isGate;
      paymentBox.hidden = true;
      pendingRequest = null;
      pendingQuote = null;
    }

    capability.addEventListener("change", syncFields);
    subjectType.addEventListener("change", syncFields);
    syncFields();

    function buildRequest() {
      const value = capability.value;
      const request = {
        request_id: randomRequestId(),
        capability: value,
      };

      if (value === "intelligence_query") {
        request.question = question.value.trim();
      } else if (value === "gri_read") {
        request.subject = { type: "global" };
      } else {
        const chosenType = value.includes("country")
          ? "country"
          : value.includes("corridor")
            ? "corridor"
            : subjectType.value;
        const from = origin.value.trim().toUpperCase();
        const to = destination.value.trim().toUpperCase();
        request.subject = chosenType === "corridor"
          ? { type: "corridor", origin_country_iso3: from, destination_country_iso3: to }
          : { type: "country", country_iso3: from };
      }

      if (value === "risk_gate_bundle") {
        request.policy_preset = policy.value;
        request.action_type = actionType.value;
        const numericAmount = Number(amount.value);
        if (amount.value.trim() && Number.isFinite(numericAmount) && numericAmount > 0) {
          request.amount_usdc = numericAmount;
        }
      }
      return request;
    }

    async function executeRequest(request) {
      const { response, payload } = await requestJson("/api/testnet-tester/intelligence", {
        method: "POST",
        body: JSON.stringify(request),
      });

      if (response.status === 402 && payload?.error?.code === "TESTNET_PAYMENT_REQUIRED") {
        if (pendingPayment) throw new Error("Payment already submitted. Retry verification with the saved transaction; do not pay again.");
        pendingRequest = request;
        pendingQuote = payload.payment;
        chainSelect.innerHTML = "";
        (payload.payment?.supported_chains || []).forEach((chain) => {
          chainSelect.appendChild(
            el("option", {
              value: chain.key,
              text: `${chain.name} · ${payload.payment.amount_due_usdc} Testnet USDC`,
            }),
          );
        });
        quoteText.textContent = `${payload.payment.credit_cost} credit${payload.payment.credit_cost === 1 ? "" : "s"} × ${payload.payment.credit_price_usdc} Testnet USDC = ${payload.payment.amount_due_usdc} Testnet USDC. No upfront payment.`;
        paymentBox.hidden = false;
        status.textContent = "Price quote ready. Pay only this call amount, then the same request will retry automatically.";
        return;
      }

      if (!response.ok || payload?.ok !== true) {
        throw new Error(
          payload?.error?.message ||
            payload?.error?.code ||
            payload?.statusMessage ||
            response.statusText ||
            "Testnet intelligence request failed.",
        );
      }

      lastResult = payload;
      lastRequest = request;
      lastShare = null;
      output.textContent = JSON.stringify(payload, null, 2);
      output.hidden = false;
      paymentBox.hidden = true;
      status.textContent = "Delivered successfully from the canonical Geomacro intelligence pipeline.";
      credits.textContent = `Credits remaining: ${payload.entitlement?.credits_remaining ?? "unknown"} · Cost: ${payload.entitlement?.credit_cost ?? "unknown"} credits · Paid: ${payload.payment?.amount_due_usdc ?? "unknown"} Testnet USDC`;
      createShare.hidden = !payload.usage_event_id;
      shareX.hidden = true;
      pendingRequest = null;
      pendingQuote = null;
      pendingPayment = null;
      try { sessionStorage.removeItem(recoveryKey); } catch {
        // Delivery succeeded. A stale saved proof is safe to retry, not repay.
      }
    }

    function setBusy(value) {
      busy = value;
      const locked = value || Boolean(pendingPayment);
      for (const control of [capability, question, subjectType, origin, destination, policy, actionType, amount, runButton, chainSelect]) {
        control.disabled = locked;
      }
      payButton.disabled = value;
      payButton.textContent = pendingPayment ? "Retry existing payment (no new transfer)" : "Pay Testnet USDC & retry";
    }

    try {
      const saved = JSON.parse(sessionStorage.getItem(recoveryKey) || "null");
      if (saved?.payment && saved?.request && saved?.quote) {
        pendingRequest = saved.request;
        pendingQuote = saved.quote;
        pendingPayment = saved.payment;
        paymentBox.hidden = false;
        quoteText.textContent = `Saved transaction: ${pendingPayment.tx_hash}`;
        status.textContent = "An earlier payment needs verification. Retry it without sending another transfer.";
        setBusy(false);
      }
    } catch {
      status.textContent = "Payment recovery storage is unavailable. Enable session storage before making a payment.";
    }

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (busy || pendingPayment) return;
      setBusy(true);
      status.textContent = "Preparing Testnet API call quote...";
      output.hidden = true;
      createShare.hidden = true;
      shareX.hidden = true;
      paymentBox.hidden = true;
      lastShare = null;
      try {
        await executeRequest(buildRequest());
      } catch (error) {
        status.textContent = error.message || "Testnet intelligence request failed.";
      } finally {
        setBusy(false);
      }
    });

    payButton.addEventListener("click", async () => {
      if (busy || !pendingRequest || !pendingQuote) return;
      if (!pendingPayment && !window.ethereum?.request) {
        status.textContent = "No injected EVM wallet detected.";
        return;
      }

      const chain = (pendingQuote.supported_chains || []).find((item) => item.key === chainSelect.value);
      if (!pendingPayment && !chain) {
        status.textContent = "Choose a supported Testnet payment network.";
        return;
      }

      setBusy(true);
      try {
        if (pendingPayment) {
          status.textContent = "Retrying the saved transaction proof. No new payment will be sent.";
          await executeRequest({ ...pendingRequest, payment: pendingPayment });
          return;
        }
        // Verify recovery storage is writable before requesting any transfer.
        saveRecovery();
        const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
        const payer = String(accounts?.[0] || "");
        if (!payer) throw new Error("Wallet account unavailable.");

        const currentChain = String(await window.ethereum.request({ method: "eth_chainId" })).toLowerCase();
        if (currentChain !== String(chain.chain_id_hex).toLowerCase()) {
          await window.ethereum.request({
            method: "wallet_switchEthereumChain",
            params: [{ chainId: chain.chain_id_hex }],
          });
        }

        const selectedChain = await window.ethereum.request({ method: "eth_chainId" });
        if (BigInt(selectedChain) !== BigInt(chain.chain_id_hex)) {
          throw new Error("Wallet network does not match the quoted Testnet chain. No payment was sent.");
        }

        status.textContent = `Confirm ${pendingQuote.amount_due_usdc} Testnet USDC in your wallet...`;
        const txHash = await window.ethereum.request({
          method: "eth_sendTransaction",
          params: [
            {
              from: payer,
              to: chain.usdc_address,
              value: "0x0",
              data: erc20TransferData(
                pendingQuote.receiver_address,
                pendingQuote.amount_due_atomic,
              ),
            },
          ],
        });

        // Preserve proof BEFORE receipt polling or API delivery can fail.
        pendingPayment = {
          chain_key: chain.key,
          tx_hash: String(txHash),
          payer_address: payer,
        };
        saveRecovery();
        quoteText.textContent = `Submitted transaction: ${pendingPayment.tx_hash}`;
        status.textContent = "Testnet USDC sent. Waiting for confirmation before retrying the same request...";
        await waitForReceipt(String(txHash));
        const retry = {
          ...pendingRequest,
          payment: pendingPayment,
        };
        await executeRequest(retry);
      } catch (error) {
        status.textContent = pendingPayment
          ? `Payment submitted (${pendingPayment.tx_hash}). ${error.message || "Verification failed."} Use Retry existing payment; do not pay again.`
          : error.message || "Testnet payment or retry failed.";
      } finally {
        setBusy(false);
      }
    });

    createShare.addEventListener("click", async () => {
      if (!lastResult?.usage_event_id || !lastRequest) return;
      status.textContent = "Creating Geomacro share card...";
      try {
        const data = lastResult.data || {};
        const score =
          lastRequest.capability === "gri_read"
            ? data.display_score
            : lastRequest.capability === "signed_risk_object"
              ? data.risk_object?.risk?.score
              : lastRequest.capability === "risk_gate_bundle"
                ? data.risk_object?.risk?.score
                : data.severity?.score ?? null;
        const delta =
          lastRequest.capability === "gri_read"
            ? data.change_points
            : data.risk_object?.risk?.delta ?? null;
        const confidence =
          lastRequest.capability === "gri_read"
            ? data.weighted_confidence
            : data.risk_object?.confidence ?? data.severity?.confidence ?? null;
        const response = await requireJson("/api/testnet-tester/share", {
          method: "POST",
          body: JSON.stringify({
            usage_event_id: lastResult.usage_event_id,
            subject: subjectLabel(lastRequest),
            summary: String(resultSummary(lastResult, lastRequest)).slice(0, 220),
            score: typeof score === "number" ? score : null,
            delta: typeof delta === "number" ? delta : null,
            confidence: typeof confidence === "number" ? confidence : null,
            chain: lastResult.payment?.chain_key || "Testnet",
            display_profile_name: false,
          }),
        });
        lastShare = response.data;
        status.textContent = `Share card ready: ${response.data.share_url}`;
        shareX.hidden = false;
      } catch (error) {
        status.textContent = error.message || "Share card creation failed.";
      }
    });

    shareX.addEventListener("click", async () => {
      if (!lastShare?.share_url || !lastShare?.share_slug) return;
      try {
        await requireJson("/api/testnet-tester/share-event", {
          method: "POST",
          body: JSON.stringify({ share_slug: lastShare.share_slug, platform: "x" }),
        });
      } catch {
        // Sharing itself should still work if telemetry is temporarily unavailable.
      }
      const message = "Testing Geomacro’s geopolitical and macro risk intelligence. Here’s one Testnet result. Feedback welcome. #Geomacro";
      window.open(
        `https://twitter.com/intent/tweet?text=${encodeURIComponent(message)}&url=${encodeURIComponent(lastShare.share_url)}`,
        "_blank",
        "noopener,noreferrer",
      );
    });
  }

  document.addEventListener("DOMContentLoaded", boot);
})();
