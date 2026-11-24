import { KeyRound } from "lucide-react";

export function ApiKeysNotice() {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 rounded-xl border border-primary/25 bg-primary/5 p-5">
        <KeyRound className="h-5 w-5 shrink-0 text-primary" aria-hidden />
        <div>
          <h2 className="text-sm font-semibold">Live mainnet access for agents</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Choose direct pay-per-call with no account, or prepaid access with a funded API key.
          </p>
        </div>
      </div>
      <div className="grid gap-3 lg:grid-cols-3">
        <article className="rounded-xl border border-border p-4">
          <h3 className="text-sm font-semibold">Direct Pay-Per-Call USDC</h3>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">No account needed. Base (8453), Polygon PoS (137), and Arc (5042) mainnet.</p>
          <p className="mt-2 text-xs leading-5">$0.15 BASIC / $0.20 STANDARD / $0.30 COMPLEX per eligible delivery. Insufficient evidence costs $0.</p>
          <a className="mt-3 inline-block break-all font-mono text-[11px] text-primary underline underline-offset-2" href="https://geomacro.live/api/v1/payments/usdc-risk-gate">
            POST https://geomacro.live/api/v1/payments/usdc-risk-gate
          </a>
        </article>
        <article className="rounded-xl border border-border p-4">
          <h3 className="text-sm font-semibold">Prepaid API Key Access</h3>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            Call Risk Gate with a funded <code>gmk_live_...</code> key. Add USDC through the live Arc, Base, or Polygon checkout in the Payment methods tab.
          </p>
          <a className="mt-3 inline-block break-all font-mono text-[11px] text-primary underline underline-offset-2" href="https://geomacro.live/api/v1/risk-gate">
            POST https://geomacro.live/api/v1/risk-gate
          </a>
          <a className="mt-2 block text-xs text-primary underline underline-offset-2" href="/pricing#payment-checkout">Open Payment methods</a>
        </article>
        <article className="rounded-xl border border-border p-4">
          <h3 className="text-sm font-semibold">Ed25519 Decision Key Discovery</h3>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">Fetch the public key used to verify signed commercial decisions.</p>
          <a className="mt-3 inline-block break-all font-mono text-[11px] text-primary underline underline-offset-2" href="https://geomacro.live/v1/risk-stream/commercial-public-key">
            GET https://geomacro.live/v1/risk-stream/commercial-public-key
          </a>
        </article>
      </div>
    </div>
  );
}
