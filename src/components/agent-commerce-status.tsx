import { useEffect, useState } from "react";

export type AgentCommerceMode = "checking" | "prelaunch" | "testnet" | "production";

type AgentCommerceState = {
  mode: AgentCommerceMode;
  priceUsdc: string | null;
  network: string | null;
};

const DEFAULT_STATE: AgentCommerceState = {
  mode: "checking",
  priceUsdc: null,
  network: null,
};

export function useAgentCommerceStatus() {
  const [state, setState] = useState<AgentCommerceState>(DEFAULT_STATE);

  useEffect(() => {
    const controller = new AbortController();

    void (async () => {
      try {
        // Payment authority remains /api/x402/intelligence; status probing deliberately uses the 200-only health surface.
        const response = await fetch("/api/health", {
          method: "GET",
          headers: { Accept: "application/json" },
          cache: "no-store",
          signal: controller.signal,
        });

        if (!response.ok) {
          setState({ mode: "prelaunch", priceUsdc: null, network: null });
          return;
        }

        const payload = (await response.json()) as Record<string, unknown>;
        const x402 = payload.x402 && typeof payload.x402 === "object" && !Array.isArray(payload.x402)
          ? payload.x402 as Record<string, unknown>
          : null;
        const configured = x402?.configured === true;
        const environment = configured && (x402?.environment === "production" || x402?.environment === "testnet")
          ? x402.environment
          : null;
        const priceUsdc = configured && typeof x402?.exact_price_usdc === "string" ? x402.exact_price_usdc : null;
        const network = configured && typeof x402?.network === "string" ? x402.network : null;

        setState({
          mode: environment === "production" ? "production" : environment === "testnet" ? "testnet" : "prelaunch",
          priceUsdc,
          network,
        });
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setState({ mode: "prelaunch", priceUsdc: null, network: null });
      }
    })();

    return () => controller.abort();
  }, []);

  return state;
}

export function AgentCommerceStatus({ compact = false }: { compact?: boolean }) {
  const state = useAgentCommerceStatus();

  const label = state.mode === "production"
    ? `x402 agent access · live${state.priceUsdc ? ` · ${state.priceUsdc} USDC/call` : ""}`
    : state.mode === "testnet"
      ? "x402 agent access · testnet proof"
      : state.mode === "checking"
        ? "x402 agent access · checking status"
        : "x402 agent access · controlled pre-launch";

  if (compact) {
    return (
      <span
        className={`inline-flex items-center rounded-full border px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.12em] ${
          state.mode === "production"
            ? "border-primary/40 bg-primary/10 text-primary"
            : "border-border/70 bg-background/40 text-muted-foreground"
        }`}
        aria-live="polite"
      >
        {label}
      </span>
    );
  }

  return (
    <div className="rounded-xl border border-border/70 bg-background/35 p-4" aria-live="polite">
      <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Runtime commercial status</p>
      <p className="mt-2 text-sm font-medium text-foreground">{label}</p>
      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
        {state.mode === "production"
          ? `The paid endpoint is advertising production x402 access${state.network ? ` on ${state.network}` : ""}. The live HTTP 402 challenge remains the payment authority.`
          : state.mode === "testnet"
            ? "The machine-payment path is configured for testnet proof only. Testnet settlement is not commercial revenue."
            : "Real-funds payment remains fail-closed until the coordinated production launch gates and owner authorization are satisfied."}
      </p>
    </div>
  );
}
