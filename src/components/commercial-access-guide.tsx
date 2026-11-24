import { Link } from "@tanstack/react-router";
import { ArrowRight, CalendarDays, Check, Zap } from "lucide-react";
import { useAgentCommerceStatus } from "@/components/agent-commerce-status";

/**
 * One commercial entitlement message shared by every public site section.
 * Never implies a recurring checkout or paid access before production is
 * actually activated. See /pricing for detailed terms and runtime status.
 */
const ACCESS = [
  {
    key: "free",
    title: "Explore free",
    subtitle: "No payment required",
    features: ["Browse public Intelligence and Risk Indices", "Ask Geomacro and read research"],
  },
  {
    key: "call",
    title: "Pay per call",
    subtitle: "Exact USDC price by capability",
    features: ["Structured intelligence for APIs and AI agents", "Pay only when a verified delivery succeeds"],
  },
  {
    key: "packs",
    title: "Prepaid API access",
    subtitle: "USDC credit packs",
    features: ["$15, $30, or $60 Risk Gate Packs", "Arc, Base, and Polygon mainnet checkout"],
  },
] as const;

export function CommercialAccessGuide() {
  const commerce = useAgentCommerceStatus();
  const x402Status = commerce.mode === "production"
    ? "Mainnet payment service live"
    : commerce.mode === "checking"
      ? "Checking mainnet payment service"
      : "Mainnet USDC access";

  return (
    <section aria-label="Choose how to access Geomacro" className="border-t border-border/60 bg-card/15">
      <div className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 sm:py-12">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-primary">Choose your access</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">Start free. Go deeper when you need to.</h2>
          </div>
          <Link to="/pricing" className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline">
            Compare access <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
        <div className="mt-6 grid gap-3 md:grid-cols-3">
          {ACCESS.map((item) => (
            <div key={item.key} className="flex min-w-0 flex-col rounded-2xl border border-border/70 bg-background/35 p-5">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-base font-semibold">{item.title}</h3>
                {item.key === "call" ? <Zap className="h-4 w-4 text-primary" aria-hidden="true" /> :
                  item.key === "packs" ? <CalendarDays className="h-4 w-4 text-primary" aria-hidden="true" /> : null}
              </div>
              <p className="mt-1 text-xs font-medium text-primary">{item.subtitle}</p>
              <p className="mt-1 text-[11px] font-medium text-muted-foreground" aria-live={item.key === "call" ? "polite" : undefined}>
                {item.key === "free"
                  ? "Available now"
                  : x402Status}
              </p>
              <ul className="mt-4 flex-1 space-y-2">
                {item.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2 text-xs leading-5 text-muted-foreground">
                    <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
                    {feature}
                  </li>
                ))}
              </ul>
              {item.key === "free" ? (
                <Link to="/intelligence" className="mt-5 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline">
                  Explore intelligence <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                </Link>
              ) : item.key === "call" ? (
                <a href="https://geomacro.live/api/v1/payments/usdc-risk-gate" className="mt-5 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline">
                  Open pay-per-call API <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                </a>
              ) : (
                <a href="/pricing#payment-checkout" className="mt-5 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline">
                  Choose a USDC pack <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                </a>
              )}
            </div>
          ))}
        </div>
        <p className="mt-4 text-xs text-muted-foreground">
          Direct pay-per-call needs no account: POST /api/v1/payments/usdc-risk-gate on Base (8453), Polygon PoS (137), or Arc (5042). Eligible deliveries cost $0.15 BASIC, $0.20 STANDARD, or $0.30 COMPLEX; insufficient evidence costs $0. Risk Gate is decision support only, with execution_authorized: false.
          {" "}<Link to="/pricing" className="text-primary hover:underline">Compare packs and agent access</Link>.
        </p>
      </div>
    </section>
  );
}
