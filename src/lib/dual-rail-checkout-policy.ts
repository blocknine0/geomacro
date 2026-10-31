import { GEOMACRO_SUBSCRIPTIONS, GEOMACRO_ONE_TIME_PACKS } from "./low-barrier-pricing";
import { GEOMACRO_USDC_NATIVE_RAILS } from "./usdc-native-rail-identities";

/**
 * This is the authoritative NON-PAYABLE checkout preparation contract.
 * It may be displayed publicly and cannot issue a merchant payment request.
 * A future production quote MUST bind a durable authenticated intent, a
 * unique quote ID, exact 6-decimal amount, chain/recipient, expiry and payer;
 * no user-provided price or paid state may ever be trusted.
 */
export const DUAL_RAIL_CHECKOUT_POLICY = Object.freeze({
  schema: "geomacro.dual-rail-checkout.v1",
  release_mode: "PRELAUNCH_LOCKED",
  production_funds_authorized: false,
  external_checkout_enabled: false,
  paypal_order_creation_enabled: false,
  paypal_capture_enabled: false,
  usdc_quote_issuance_enabled: false,
  usdc_settlement_verification_enabled: false,
  credit_grants_enabled: false,
  paypal_environment_allowed: "sandbox_when_authorized_for_testing_only",
  paypal_merchant_country: "IN",
  paypal_buyer_scope: "INTERNATIONAL_ONLY",
  paypal_settlement: "INR_TO_LINKED_INDIAN_BANK",
  paypal_auto_renewal_enabled: false,
  direct_usdc_rails: ["base", "polygon"] as const,
  no_card_to_usdc: true,
  no_wallet_payment_instructions: true,
  no_payable_qr_codes: true,
  manual_erc20_transfer_has_memo: false,
  testing_does_not_issue_paid_credits: true,
} as const);

export type PreviewNetwork = "base" | "polygon";
export const PREVIEW_NETWORKS = Object.freeze({
  base: GEOMACRO_USDC_NATIVE_RAILS.base,
  polygon: GEOMACRO_USDC_NATIVE_RAILS.polygon,
});

/** Server-derived catalog, no arbitrary buyer amount or credit quantity. */
export function readOnlyDualRailCatalog() {
  return {
    ...DUAL_RAIL_CHECKOUT_POLICY,
    products: [
      ...GEOMACRO_SUBSCRIPTIONS.map(p => ({
        sku: p.id, name: p.name, price_usd: p.price_usd,
        credits: p.credits_per_30_days, entitlement: "30_DAY_PREPAID_MANUAL_RENEWAL",
      })),
      ...GEOMACRO_ONE_TIME_PACKS.map(p => ({
        sku: p.id, name: p.name, price_usd: p.price_usd,
        credits: p.credits, entitlement: "ONE_TIME_CREDIT_PACK",
      })),
    ],
    networks: Object.values(PREVIEW_NETWORKS).map(x => ({
      id: x.id, chain_id: x.chain_id, caip2: x.caip2,
      native_usdc_asset: x.asset, decimals: x.decimals,
      accepting_payments: false,
    })),
  };
}

export function readOnlyCryptoQuotePreview(input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw Error("CHECKOUT_PREVIEW_INPUT_INVALID");
  const value = input as Record<string, unknown>;
  if (Object.keys(value).length !== 2 ||
      typeof value.sku !== "string" ||
      typeof value.network !== "string" ||
      !Object.hasOwn(PREVIEW_NETWORKS, value.network))
    throw Error("CHECKOUT_PREVIEW_SCOPE_INVALID");
  const product = readOnlyDualRailCatalog().products.find(x => x.sku === value.sku);
  if (!product) throw Error("CHECKOUT_SKU_UNSUPPORTED");
  const rail = PREVIEW_NETWORKS[value.network as PreviewNetwork];
  return {
    ok: false,
    code: "EXTERNAL_PAYMENTS_LOCKED",
    sku: product.sku,
    currency: "USDC",
    indicative_usdc: product.price_usd.toFixed(2),
    usd_catalog_price: product.price_usd,
    preview_only: true,
    quote_id: null,
    expires_at: null,
    merchant_recipient: null,
    payment_uri: null,
    requires_wallet_payment: false,
    chargeable: false,
    credits_funded: 0,
    network: rail.caip2,
    token: rail.asset,
    decimals: 6,
    details: "No transferable quote exists until merchant settlement and ledger acceptance.",
  };
}
