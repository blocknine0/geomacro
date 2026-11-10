import { useState } from "react";
import { GEOMACRO_USDC_NATIVE_RAILS } from "@/lib/usdc-native-rail-identities";
import { ShieldCheck, Wallet } from "lucide-react";

export type CheckoutSelection = {
  id:string;
  name:string;
  amountUsd:number;
  credits:number;
  kind:"monthly_plan"|"one_time_pack";
};

/**
 * Owner-directed USDC-ONLY merchant surface. This checkout is NOT payable:
 * it cannot reveal an unapproved receiving wallet, emit a QR / EIP-681 URI,
 * authorize a token allowance, or mint buyer credits without on-chain finality.
 * Historical PayPal refund webhooks remain operational independently.
 */
export function LockedDualRailCheckout({selection}:{selection:CheckoutSelection}){
  const [network,setNetwork]=useState<"base"|"polygon">("base");
  const rail=GEOMACRO_USDC_NATIVE_RAILS[network];
  return <section id="payment-checkout" aria-labelledby="gm-checkout-heading"
    data-dual-rail-checkout="usdc-only-prelaunch-locked"
    className="scroll-mt-40 rounded-2xl border border-primary/30 bg-primary/5 p-5 sm:p-7">
    <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div>
        <p className="gm-eyebrow">Crypto only · native USDC</p>
        <h2 id="gm-checkout-heading" className="mt-2 text-2xl font-semibold tracking-tight">
          Pay with USDC on Base or Polygon
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
          GeoMacro is preparing wallet payments only. PayPal, card and fiat checkout
          are disabled for new sales. No real-money checkout is available until
          receiving-wallet ownership, settlement, ledger, evidence and delivery
          verification have passed.
        </p>
      </div>
      <span className="rounded-full border border-border bg-background px-3 py-1.5 text-xs font-semibold text-muted-foreground">
        Crypto payment locked · no charge
      </span>
    </div>

    <div className="grid gap-5 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
      <aside aria-label="Selected pricing product"
        className="self-start rounded-xl border border-border bg-background p-5">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Selected product
        </p>
        <h3 className="mt-3 text-lg font-semibold">{selection.name}</h3>
        <p className="mt-3 text-4xl font-semibold">
          {"$"}{selection.amountUsd}
          <span className="ml-2 text-sm font-normal text-muted-foreground">USD · quoted in USDC</span>
        </p>
        <p className="mt-3 font-medium">{selection.credits.toLocaleString("en-US")} credits</p>
        <p className="mt-2 text-xs leading-5 text-muted-foreground">
          {selection.kind==="monthly_plan"?
            "Prepaid 30-day access · manual renewal; no automatic wallet debit":
            "One-time prepaid credit pack · no subscription"}
        </p>
        <p className="mt-5 border-t border-border pt-4 text-xs leading-5 text-muted-foreground">
          Credits are issued only after exact native USDC payment, canonical on-chain
          confirmations, durable ledger readback and eligibility checks.
        </p>
        <a href="#plans" className="mt-4 inline-block text-sm font-semibold text-primary underline underline-offset-4">
          Change plan or pack
        </a>
      </aside>

      <div className="rounded-xl border border-border bg-background p-4 sm:p-5">
        <div className="flex items-center gap-2">
          <Wallet className="h-5 w-5" aria-hidden />
          <h3 className="font-semibold">Native USDC · supported mainnets</h3>
        </div>
        <div className="mt-4">
          <label htmlFor="gm-usdc-network" className="block text-sm font-medium">
            Choose network
          </label>
          <select id="gm-usdc-network" value={network}
            onChange={e=>setNetwork(e.target.value as "base"|"polygon")}
            className="mt-2 w-full rounded-lg border border-input bg-background px-3 py-3 text-sm">
            <option value="base">Base Mainnet (chain ID 8453)</option>
            <option value="polygon">Polygon PoS Mainnet (chain ID 137)</option>
          </select>
        </div>
        <div className="mt-4 rounded-lg border border-border p-3 text-sm">
          <p><span className="font-medium">Accepted token:</span> Circle native USDC · 6 decimals</p>
          <p className="mt-1"><span className="font-medium">Network:</span> {rail.caip2}</p>
          <p className="mt-1 break-all font-mono text-xs text-muted-foreground">
            Token contract: {rail.asset}
          </p>
          <p className="mt-3 text-xs leading-5 text-muted-foreground">
            Bridged USDC.e, testnet tokens and transfers on unsupported networks
            are not accepted. The displayed token contract is not a merchant wallet address.
          </p>
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <button type="button" disabled
            className="cursor-not-allowed rounded-lg bg-muted px-4 py-3 text-sm font-semibold text-muted-foreground">
            Connect wallet · Locked
          </button>
          <button type="button" disabled
            className="cursor-not-allowed rounded-lg bg-muted px-4 py-3 text-sm font-semibold text-muted-foreground">
            Manual transfer / QR · Locked
          </button>
        </div>
        <p className="mt-3 text-xs leading-5 text-muted-foreground">
          No payable quote, receiver address, transfer instruction or payment QR is issued
          until independent live verification is complete. Do not send USDC yet.
        </p>
      </div>
    </div>
    <p role="status" className="mt-5 flex items-start gap-2 rounded-lg border border-border bg-background/80 p-3 text-xs leading-5 text-muted-foreground">
      <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      Crypto-only preparation. No fiat charge, wallet transfer,
      customer credit top-up or API entitlement is active.
    </p>
    <p className="mt-3 text-xs text-muted-foreground">
      Supported-network discovery: geomacro.live/api/v1/payments/networks.
      Crypto payments do not eliminate applicable tax, invoicing or compliance obligations.
    </p>
  </section>;
}
