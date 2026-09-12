(() => {
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
      const response = await fetch("/api/testnet-tester/config", {
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

  document.addEventListener("DOMContentLoaded", syncCanonicalPricing);
})();
