import {ArrowUpRight, ShieldCheck, Wallet} from "lucide-react";

/** Merchant buyer onboarding only; NEVER implies that mainnet payments are active. */
export function KeylessBuyerQuickstart() {
  return (
    <section aria-label="Wallet-based pay-per-call buyer guide" className="rounded-2xl border border-border p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <Wallet className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden />
        <div>
          <h2 className="text-base font-semibold">API buyers: wallet-based USDC per call</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            No buyer API key is needed for the planned x402 path. Managed API keys are coming soon.
          </p>
        </div>
      </div>
      <div className="mt-5 grid gap-4 text-sm sm:grid-cols-3">
        <div><strong>01 · Discover</strong><p className="mt-1 text-muted-foreground">See the locked capability prices for free.</p></div>
        <div><strong>02 · Check</strong><p className="mt-1 text-muted-foreground">No-charge availability check before payment.</p></div>
        <div><strong>03 · Pay & verify</strong><p className="mt-1 text-muted-foreground">After activation, pay only for an eligible signed delivery.</p></div>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
        <a className="gm-text-link" href="/.well-known/geomacro-buyer.json">
          Machine-readable buyer catalog <ArrowUpRight className="h-4 w-4" aria-hidden />
        </a>
        <a className="gm-text-link" href="/.well-known/x402.json">
          Live x402 discovery <ArrowUpRight className="h-4 w-4" aria-hidden />
        </a>
      </div>
      <p className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
        <ShieldCheck className="h-4 w-4 shrink-0" aria-hidden />
        Controlled prelaunch: no real-money checkout until verified signed products, rights and owner approval.
      </p>
    </section>
  );
}
