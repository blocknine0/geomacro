import { z } from "zod";
import { resolveGeomacroCapabilityPrice } from "./capability-pricing-catalog";

export const STORE_STRUCTURAL_PRODUCTS = ["structural_country_digest", "structural_corridor_digest",
  "structural_country_profile", "structural_corridor_profile"] as const;
export const storeProductSelectionSchema = z.object({
  capability: z.enum([...STORE_STRUCTURAL_PRODUCTS, "intelligence_query", "signed_risk_object", "risk_gate_bundle"]),
  variant: z.string().min(1).max(64),
  // A request constraint, never a client assertion that an object was issued.
  issued_after: z.string().datetime({ offset: true }).optional(),
}).strict().superRefine((value, ctx) => {
  try { resolveGeomacroCapabilityPrice(value.capability, value.variant); }
  catch { ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Unsupported Store product variant" }); }
  const newlyIssued = value.capability === "signed_risk_object" && value.variant === "newly_qualified_signed";
  if (newlyIssued !== (value.issued_after !== undefined))
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "issued_after is required only for newly qualified signed objects" });
});
export type StoreProductSelection = z.infer<typeof storeProductSelectionSchema>;
export function isStructuralStoreProduct(product: StoreProductSelection | undefined): boolean {
  return !!product && (STORE_STRUCTURAL_PRODUCTS as readonly string[]).includes(product.capability);
}
export function isStoreProfile(product: StoreProductSelection | undefined): boolean {
  return isStructuralStoreProduct(product) && product!.capability.endsWith("_profile");
}

/** Explicit products never silently change the meaning of an existing query. */
export function assertStoreProductScope(input: {
  product?: StoreProductSelection; delivery_tier: string; fulfillment_mode: string; detail: string;
  subjects: readonly { type: string }[]; topics: readonly string[]; intent?: string;
  as_of?: string; ranking?: unknown; change?: unknown; risk_gate_context?: unknown;
}) {
  const product = input.product;
  if (!product) return;
  if (input.fulfillment_mode !== "published_only") throw Error("STORE_PRODUCT_REQUIRES_VERIFIED_PUBLISHED_DATA");
  if (isStructuralStoreProduct(product)) {
    const expectedSubject = product.capability.includes("corridor") ? "corridor" : "country";
    if (input.delivery_tier !== "structural_baseline" || input.subjects.length !== 1 ||
        input.subjects[0].type !== expectedSubject || input.as_of || input.ranking || input.change || input.risk_gate_context ||
        (input.intent && input.intent !== (expectedSubject === "country" ? "single_subject" : "corridor")))
      throw Error("STORE_STRUCTURAL_PRODUCT_SCOPE_MISMATCH");
    const allowed = ["sovereign_risk", "macro_risk", "fx_external_risk", "critical_minerals", "conflict_geopolitics"];
    const count = new Set(input.topics).size;
    if (!count || input.topics.some(topic => !allowed.includes(topic)) ||
        (isStoreProfile(product) ? count < 2 || input.detail !== "full" : count !== 1))
      throw Error("STORE_STRUCTURAL_PRODUCT_DIMENSIONS_REQUIRED");
  } else {
    if (input.delivery_tier !== "signed_risk_intelligence") throw Error("STORE_SIGNED_PRODUCT_TIER_MISMATCH");
    if (product.capability === "intelligence_query" &&
        (!input.topics.some(topic => !["risk_object", "gri_context", "risk_gate"].includes(topic)) || input.topics.includes("risk_gate")))
      throw Error("STORE_INTELLIGENCE_QUERY_SCOPE_MISMATCH");
    if (product.capability === "signed_risk_object" &&
        (input.subjects.length !== 1 || input.topics.length !== 1 || input.topics[0] !== "risk_object"))
      throw Error("STORE_SIGNED_OBJECT_SCOPE_MISMATCH");
    if (product.capability === "risk_gate_bundle" &&
        (input.subjects.length !== 1 || !input.topics.includes("risk_gate") || !input.risk_gate_context))
      throw Error("STORE_RISK_GATE_SCOPE_MISMATCH");
  }
}
