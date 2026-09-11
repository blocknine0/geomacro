(() => {
  const json = async (url, options = {}) => {
    const response = await fetch(url, {
      credentials: "same-origin",
      headers: {
        accept: "application/json",
        ...(options.body ? { "content-type": "application/json" } : {}),
        ...(options.headers || {}),
      },
      ...options,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload?.ok === false) {
      throw new Error(payload?.statusMessage || payload?.message || response.statusText || "Request failed");
    }
    return payload;
  };

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

  function makeField(labelText, control) {
    const wrap = el("div", { className: "field" });
    wrap.appendChild(el("label", { text: labelText }));
    wrap.appendChild(control);
    return wrap;
  }

  async function boot() {
    let account;
    try {
      account = (await json("/api/testnet-tester/me")).data;
    } catch {
      return;
    }
    if (account?.access_status !== "active") return;
    if (document.getElementById("testerConsolePanel")) return;

    let lastResult = null;
    let lastShare = null;

    const panel = el("section", { className: "panel", id: "testerConsolePanel" });
    panel.appendChild(el("div", { className: "eyebrow", text: "TRY GEOMACRO" }));
    panel.appendChild(el("h2", { text: "Run a metered Testnet intelligence request" }));
    panel.appendChild(el("p", { className: "muted", text: "Use the same fixed 500-credit quota directly from the website. Country and corridor requests use governed structural intelligence and are recorded in the owner operations ledger." }));

    const capability = el("select", { id: "testerCapability" });
    [
      ["structural_country_digest", "Country digest · 3 credits"],
      ["structural_country_profile", "Country profile · 8 credits"],
      ["structural_corridor_digest", "Corridor digest · 5 credits"],
      ["structural_corridor_profile", "Corridor profile · 12 credits"],
    ].forEach(([value, label]) => capability.appendChild(el("option", { value, text: label })));

    const origin = el("input", { id: "testerOrigin", maxlength: "3", value: "IND" });
    const destination = el("input", { id: "testerDestination", maxlength: "3", value: "USA" });
    const destinationField = makeField("Destination ISO3", destination);
    destinationField.hidden = true;

    const form = el("form", { className: "form-grid", id: "testerConsoleForm" });
    form.appendChild(makeField("Capability", capability));
    form.appendChild(makeField("Country / origin ISO3", origin));
    form.appendChild(destinationField);
    const runWrap = el("div", { className: "field full" });
    const runButton = el("button", { type: "submit", text: "Run Testnet intelligence" });
    runWrap.appendChild(runButton);
    form.appendChild(runWrap);
    panel.appendChild(form);

    const status = el("div", { className: "okline", id: "testerConsoleStatus" });
    const credits = el("div", { className: "notice", text: "Credits remaining will appear after the request." });
    const output = el("pre", { id: "testerConsoleOutput" });
    output.style.whiteSpace = "pre-wrap";
    output.style.maxHeight = "440px";
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

    panel.append(status, credits, output, actions);
    const anchor = document.getElementById("feedbackPanel") || document.getElementById("developerPanel");
    if (anchor?.parentNode) anchor.parentNode.insertBefore(panel, anchor);
    else document.querySelector("main")?.appendChild(panel);

    const syncSubject = () => {
      destinationField.hidden = !capability.value.includes("corridor");
    };
    capability.addEventListener("change", syncSubject);
    syncSubject();

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      status.textContent = "Running governed Testnet intelligence...";
      output.hidden = true;
      createShare.hidden = true;
      shareX.hidden = true;
      lastShare = null;

      const requestId = `web-${crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`}`;
      const isCorridor = capability.value.includes("corridor");
      const from = origin.value.trim().toUpperCase();
      const to = destination.value.trim().toUpperCase();
      const subject = isCorridor
        ? { type: "corridor", origin_country_iso3: from, destination_country_iso3: to }
        : { type: "country", country_iso3: from };

      try {
        const response = await json("/api/testnet-tester/intelligence", {
          method: "POST",
          body: JSON.stringify({ request_id: requestId, capability: capability.value, subject }),
        });
        lastResult = response.data;
        output.textContent = JSON.stringify(response.data, null, 2);
        output.hidden = false;
        status.textContent = "Delivered successfully.";
        credits.textContent = `Credits remaining: ${response.data.entitlement?.credits_remaining ?? "unknown"} · Cost: ${response.data.entitlement?.credit_cost ?? "unknown"}`;
        createShare.hidden = !response.data.usage_event_id;
      } catch (error) {
        status.textContent = error.message || "Testnet intelligence request failed.";
      }
    });

    createShare.addEventListener("click", async () => {
      if (!lastResult?.usage_event_id) return;
      const subject = lastResult.data?.subject || {};
      const subjectLabel = subject.type === "country"
        ? String(subject.country_iso3 || "Geomacro")
        : `${String(subject.origin_country_iso3 || "")}>${String(subject.destination_country_iso3 || "")}`;
      status.textContent = "Creating Geomacro share card...";
      try {
        const response = await json("/api/testnet-tester/share", {
          method: "POST",
          body: JSON.stringify({
            usage_event_id: lastResult.usage_event_id,
            subject: subjectLabel,
            summary: "Governed geopolitical and macro risk intelligence tested with Geomacro.",
            score: null,
            delta: null,
            confidence: null,
            chain: "Testnet",
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
        await json("/api/testnet-tester/share-event", {
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
