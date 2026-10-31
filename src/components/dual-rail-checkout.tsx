import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
 * Customer-facing checkout preparation, never a payment form or payable quote.
 * Independently enforced server/launch gates prohibit transfers and credits.
 */
export function LockedDualRailCheckout({
  selection,
  onClose,
}: {
  selection: CheckoutSelection | null;
  onClose: () => void;
}) {
  const [rail, setRail] = useState<"paypal" | "usdc">("paypal");
  const [network, setNetwork] = useState<"base" | "polygon">("base");
  const chain = GEOMACRO_USDC_NATIVE_RAILS[network];

  return (
    <Dialog open={selection !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto" data-dual-rail-checkout="prelaunch-locked">
        <DialogHeader>
          <DialogTitle>GeoMacro checkout</DialogTitle>
          <DialogDescription>
            Select how you would pay when checkout opens. Payments and
            credit issuance are currently disabled for everyone.
          </DialogDescription>
        </DialogHeader>

        {selection && (
          <div className="space-y-5">
            <div className="rounded-xl border border-border bg-muted/40 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Your selection</p>
                  <p className="mt-1 font-semibold">{selection.name}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {selection.credits.toLocaleString("en-US")} credits ·{" "}
                    {selection.kind === "monthly_plan" ? "30-day allocation; manual renewal" : "One-time credit pack"}
                  </p>
                </div>
                <p className="text-2xl font-semibold">{"$"}{selection.amountUsd}<span className="ml-1 text-xs font-normal text-muted-foreground">USD</span></p>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                Credits will only be issued after independent authenticated settlement and a durable ledger readback.
                This preview cannot create an order or take payment.
              </p>
            </div>

            <div role="tablist" aria-label="Checkout payment method" className="grid grid-cols-2 gap-2 rounded-xl bg-muted p-1.5">
              <button type="button" role="tab" aria-selected={rail === "paypal"} aria-controls="gm-paypal-panel"
                onClick={() => setRail("paypal")}
                className={"flex min-h-11 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold " +
                  (rail === "paypal" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
                <CreditCard className="h-4 w-4" aria-hidden /> Card / PayPal
              </button>
              <button type="button" role="tab" aria-selected={rail === "usdc"} aria-controls="gm-usdc-panel"
                onClick={() => setRail("usdc")}
                className={"flex min-h-11 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold " +
                  (rail === "usdc" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
                <Wallet className="h-4 w-4" aria-hidden /> Crypto USDC
              </button>
            </div>

            {rail === "paypal" ? (
              <section id="gm-paypal-panel" role="tabpanel" aria-label="PayPal checkout preview" className="space-y-3">
                <h3 className="font-semibold">PayPal checkout · cross-border fiat</h3>
                <p className="text-sm leading-6 text-muted-foreground">
                  Eligible international customers will be able to use PayPal and provider-supported cards.
                  A crypto wallet is not required. PayPal settles to GeoMacro's linked Indian bank
                  account in fiat INR, not USDC.
                </p>
                <p className="text-xs text-muted-foreground">
                  India-to-India PayPal payments are not supported. Provider checkout requires merchant
                  approval and KYC. Card availability and bank settlement depend on PayPal.
                  Monthly plans are prepaid for 30 days; auto-renewal is not enabled.
                </p>
                <button type="button" disabled
                  className="w-full cursor-not-allowed rounded-lg bg-muted px-4 py-3 text-sm font-semibold text-muted-foreground"
                  aria-label="PayPal checkout unavailable during testing">
                  PayPal / card checkout · Locked
                </button>
              </section>
            ) : (
              <section id="gm-usdc-panel" role="tabpanel" aria-label="USDC checkout preview" className="space-y-4">
                <h3 className="font-semibold">Native USDC · wallet checkout</h3>
                <label htmlFor="gm-usdc-network" className="block text-sm font-medium">Network</label>
                <select id="gm-usdc-network" value={network} onChange={(event) => setNetwork(event.target.value as "base" | "polygon")}
                  className="w-full rounded-lg border border-input bg-background px-3 py-3 text-sm">
                  <option value="base">Base Mainnet</option>
                  <option value="polygon">Polygon PoS Mainnet</option>
                </select>
                <div className="rounded-lg border border-border p-3 text-sm">
                  <p><span className="font-medium">Asset:</span> Native USDC · 6 decimals</p>
                  <p className="mt-1"><span className="font-medium">Network:</span> {chain.caip2}</p>
                  <p className="mt-1 break-all font-mono text-xs text-muted-foreground">Token: {chain.asset}</p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Never send bridged USDC.e or funds on the wrong chain. At launch,
                    server verification must check exact token, receiving address,
                    amount, finalized receipt, quote ownership, and replay protection.
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
                  No payable quote, QR code, merchant transfer instruction, or transaction authorization
                  is issued while external payment is locked. Ordinary ERC-20 transfers cannot carry
                  a memo or quote ID; do not transfer funds based on this preview.
                </p>
              </section>
            )}

            <p role="status" className="flex items-start gap-2 rounded-lg border border-border bg-muted/40 p-3 text-xs leading-5 text-muted-foreground">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              Testing setup only. No real-money checkout, wallet transfer, PayPal
              capture, credit top-up or API entitlement is active.
            </p>
            <p className="text-xs text-muted-foreground">
              API discovery: geomacro.live /api/v1/payments/networks · geomacro.live /api/v1/payments/paypal
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
