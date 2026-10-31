import { useState } from "react";
import { GEOMACRO_USDC_NATIVE_RAILS } from "@/lib/usdc-native-rail-identities";
import { CreditCard, ShieldCheck, Wallet } from "lucide-react";

export type CheckoutSelection = {
  id: string;
  name: string;
  amountUsd: number;
  credits: number;
  kind: "monthly_plan" | "one_time_pack";
};

/**
 * Inline checkout preview on the canonical /pricing page.
 * No PayPal order, payable crypto quote, QR or funds/credits can be issued.
 */
export function LockedDualRailCheckout({ selection }: { selection: CheckoutSelection }) {
  const [rail, setRail] = useState<"paypal" | "usdc">("paypal");
  const [network, setNetwork] = useState<"base" | "polygon">("base");
  const chain = GEOMACRO_USDC_NATIVE_RAILS[network];

  return (
    <section id="payment-checkout" aria-labelledby="gm-checkout-heading"
      data-dual-rail-checkout="prelaunch-locked"
      className="scroll-mt-40 rounded-2xl border border-primary/30 bg-primary/5 p-5 sm:p-7">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="gm-eyebrow">Payment methods · visible on pricing</p>
          <h2 id="gm-checkout-heading" className="mt-2 text-2xl font-semibold tracking-tight">
            Pay directly from this page
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            Select any plan or credit pack above, then choose PayPal / card or native USDC.
            This embedded checkout is a non-payable preview while integration testing is locked.
          </p>
        </div>
        <span className="rounded-full border border-border bg-background px-3 py-1.5 text-xs font-semibold text-muted-foreground">
          Payments locked · no charge
        </span>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
        <aside aria-label="Selected pricing product" className="self-start rounded-xl border border-border bg-background p-5">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Selected product</p>
          <h3 className="mt-3 text-lg font-semibold">{selection.name}</h3>
          <p className="mt-3 text-4xl font-semibold">
            {"$"}{selection.amountUsd}<span className="ml-2 text-sm font-normal text-muted-foreground">USD</span>
          </p>
          <p className="mt-3 font-medium">{selection.credits.toLocaleString("en-US")} credits</p>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">
            {selection.kind === "monthly_plan"
              ? "Prepaid 30-day access · manual renewal, no recurring charge"
              : "One-time credit pack · no subscription"}
          </p>
          <p className="mt-5 border-t border-border pt-4 text-xs leading-5 text-muted-foreground">
            Credits are issued only after an authenticated finalized payment and
            durable entitlement-ledger readback. This preview issues nothing.
          </p>
          <a href="#plans" className="mt-4 inline-block text-sm font-semibold text-primary underline underline-offset-4">
            Change plan or pack
          </a>
        </aside>

        <div className="rounded-xl border border-border bg-background p-4 sm:p-5">
          <div role="tablist" aria-label="Payment method" className="grid grid-cols-2 gap-2 rounded-xl bg-muted p-1.5">
            <button id="gm-paypal-tab" type="button" role="tab" aria-controls="gm-paypal-panel"
              aria-selected={rail === "paypal"} tabIndex={rail === "paypal" ? 0 : -1}
              onClick={() => setRail("paypal")}
              className={"flex min-h-11 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold " +
                (rail === "paypal" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
              <CreditCard className="h-4 w-4" aria-hidden /> PayPal / card
            </button>
            <button id="gm-usdc-tab" type="button" role="tab" aria-controls="gm-usdc-panel"
              aria-selected={rail === "usdc"} tabIndex={rail === "usdc" ? 0 : -1}
              onClick={() => setRail("usdc")}
              className={"flex min-h-11 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold " +
                (rail === "usdc" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
              <Wallet className="h-4 w-4" aria-hidden /> Crypto USDC
            </button>
          </div>

          <section id="gm-paypal-panel" role="tabpanel" aria-labelledby="gm-paypal-tab"
            hidden={rail !== "paypal"} className="mt-5 space-y-3">
            <h3 className="font-semibold">PayPal checkout · cross-border fiat</h3>
            <p className="text-sm leading-6 text-muted-foreground">
              Eligible international customers can pay using PayPal or provider-supported cards
              when merchant onboarding is approved. No crypto wallet is needed.
              PayPal settlement goes to the linked Indian bank account in fiat, not USDC.
            </p>
            <p className="text-xs leading-5 text-muted-foreground">
              Domestic India-to-India PayPal collection is not supported. Card availability
              depends on PayPal and merchant KYC. Plans do not auto-renew.
            </p>
            <button type="button" disabled
              className="w-full cursor-not-allowed rounded-lg bg-muted px-4 py-3 text-sm font-semibold text-muted-foreground"
              aria-label="PayPal checkout disabled until live activation">
              PayPal / card checkout · Locked
            </button>
          </section>

          <section id="gm-usdc-panel" role="tabpanel" aria-labelledby="gm-usdc-tab"
            hidden={rail !== "usdc"} className="mt-5 space-y-4">
            <h3 className="font-semibold">Native USDC · Base or Polygon</h3>
            <div>
              <label htmlFor="gm-usdc-network" className="block text-sm font-medium">Choose network</label>
              <select id="gm-usdc-network" value={network}
                onChange={(event) => setNetwork(event.target.value as "base" | "polygon")}
                className="mt-2 w-full rounded-lg border border-input bg-background px-3 py-3 text-sm">
                <option value="base">Base Mainnet</option>
                <option value="polygon">Polygon PoS Mainnet</option>
              </select>
            </div>
            <div className="rounded-lg border border-border p-3 text-sm">
              <p><span className="font-medium">Asset:</span> Native USDC · 6 decimals</p>
              <p className="mt-1"><span className="font-medium">Network:</span> {chain.caip2}</p>
              <p className="mt-1 break-all font-mono text-xs text-muted-foreground">Token: {chain.asset}</p>
              <p className="mt-3 text-xs leading-5 text-muted-foreground">
                Send neither USDC.e nor unsupported tokens. Settlement must verify the exact
                chain, token, receiving wallet, amount, finalized receipt and replay protection.
              </p>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <button type="button" disabled className="cursor-not-allowed rounded-lg bg-muted px-4 py-3 text-sm font-semibold text-muted-foreground">
                Connect wallet · Locked
              </button>
              <button type="button" disabled className="cursor-not-allowed rounded-lg bg-muted px-4 py-3 text-sm font-semibold text-muted-foreground">
                Manual transfer / QR · Locked
              </button>
            </div>
            <p className="text-xs leading-5 text-muted-foreground">
              No payable quote, recipient instruction, QR code or transaction authorization is provided.
              Never send funds based on this preview.
            </p>
          </section>
        </div>
      </div>

      <p role="status" className="mt-5 flex items-start gap-2 rounded-lg border border-border bg-background/80 p-3 text-xs leading-5 text-muted-foreground">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        Prelaunch preview only. No PayPal capture, card charge, USDC transfer,
        credit top-up or API entitlement is active.
      </p>
      <p className="mt-3 text-xs text-muted-foreground">
        API discovery: geomacro.live /api/v1/payments/networks · geomacro.live /api/v1/payments/paypal
      </p>
    </section>
  );
}
