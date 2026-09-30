import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  CheckCircle2,
  Fingerprint,
  Route as RouteIcon,
  ShieldCheck,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const TITLE = "Risk Gate Private Pilot · Geomacro";
const DESCRIPTION =
  "Geomacro Risk Gate is a controlled testnet decision-context layer for country and directional-corridor risk checks before treasury, payment and agent actions.";
const OUTPUTS = ["CONTINUE", "REDUCE_LIMIT", "REQUIRE_APPROVAL", "PAUSE"] as const;

export const Route = createFileRoute("/risk-gate")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://geomacro.live/risk-gate" },
      { property: "og:image", content: "https://geomacro.live/og-signal-card-v2.png" },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: "https://geomacro.live/risk-gate" }],
  }),
  component: RiskGatePage,
});

function RiskGatePage() {
  return (
    <main>
      <section className="relative overflow-hidden border-b border-border/55">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_82%_18%,color-mix(in_oklab,var(--primary)_13%,transparent),transparent_30%)]" />
        <div className="relative mx-auto grid w-full max-w-7xl gap-10 px-4 py-12 sm:px-6 sm:py-18 lg:grid-cols-[1.04fr_.96fr] lg:items-center lg:py-22">
          <div>
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline" className="border-amber-400/40 bg-amber-400/5 font-mono text-[10px] uppercase tracking-[0.14em] text-amber-300">PRIVATE PILOT</Badge>
              <Badge variant="outline" className="border-primary/25 bg-primary/5 font-mono text-[10px] uppercase tracking-[0.14em] text-primary">TESTNET</Badge>
            </div>
            <h1 className="mt-5 text-[clamp(2.8rem,6vw,5.6rem)] font-semibold leading-[0.96] tracking-[-0.05em]">
              Put a risk check between context and action.
            </h1>
            <p className="mt-6 max-w-3xl text-base leading-7 text-muted-foreground sm:text-lg sm:leading-8">
              Risk Gate verifies a signed country or corridor Risk Object, evaluates the current external-risk context and returns a bounded pre-decision recommendation before the customer&apos;s own system acts.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <Button asChild size="lg" className="h-12 gap-2 px-6"><Link to="/contact">Discuss a Private Pilot <ArrowRight className="h-4 w-4" /></Link></Button>
              <Button asChild size="lg" variant="outline" className="h-12 px-6"><Link to="/intelligence">See live intelligence</Link></Button>
            </div>
            <p className="mt-5 max-w-3xl text-xs leading-5 text-muted-foreground">Controlled pilot only. Geomacro returns decision context; it does not sign, authorize or submit customer transactions.</p>
          </div>

          <div className="rounded-[1.65rem] border border-border/65 bg-card/65 p-5 shadow-2xl shadow-black/20 backdrop-blur sm:p-7">
            <p className="font-mono text-[10px] uppercase tracking-[0.17em] text-muted-foreground">Possible Risk Gate outputs</p>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {OUTPUTS.map((output, index) => (
                <div key={output} className="rounded-xl border border-border/60 bg-background/30 p-4">
                  <p className="font-mono text-[10px] text-primary">0{index + 1}</p>
                  <p className="mt-2 font-mono text-sm font-semibold">{output}</p>
                </div>
              ))}
            </div>
            <div className="mt-4 rounded-xl border border-primary/20 bg-primary/5 p-4">
              <p className="font-mono text-xs text-primary">execution_authorized = false</p>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">The customer keeps identity, permissions, policy enforcement and final execution.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-7xl px-4 py-14 sm:px-6 sm:py-20">
        <div className="max-w-3xl">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-primary">How it works</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-[-0.03em] sm:text-4xl">Four bounded steps. No hidden execution authority.</h2>
        </div>
        <div className="mt-9 grid overflow-hidden rounded-2xl border border-border/65 bg-border/60 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["01", "Verify", "Validate object signature, integrity and freshness."],
            ["02", "Evaluate", "Read current risk, change, confidence and relevant drivers."],
            ["03", "Apply policy", "Evaluate the caller-supplied policy profile against the bounded context."],
            ["04", "Return", "Return one controlled recommendation with an auditable decision record."],
          ].map(([step, title, body]) => (
            <article key={step} className="bg-background/88 p-5 sm:p-6">
              <p className="font-mono text-[10px] tracking-[0.16em] text-primary">{step}</p>
              <h3 className="mt-3 text-lg font-semibold">{title}</h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="border-y border-border/55 bg-card/15">
        <div className="mx-auto grid w-full max-w-7xl gap-10 px-4 py-14 sm:px-6 sm:py-20 lg:grid-cols-[.82fr_1.18fr] lg:items-start">
          <div>
            <RouteIcon className="h-5 w-5 text-primary" />
            <p className="mt-4 font-mono text-[10px] uppercase tracking-[0.18em] text-primary">Private Pilot scope</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-[-0.03em] sm:text-4xl">Country and directional-corridor context only.</h2>
          </div>
          <div className="space-y-4">
            <div className="rounded-2xl border border-border/60 bg-background/30 p-5 sm:p-6">
              <p className="text-sm leading-7 text-muted-foreground">
                Current Private Pilot scope is country and directional corridor risk. Geomacro supports directional corridors composed from endpoints plus eligible bilateral evidence.
              </p>
            </div>
            <div className="rounded-2xl border border-border/60 bg-background/30 p-5 sm:p-6">
              <p className="text-sm leading-7 text-muted-foreground">
                Full physical-route and counterparty modelling are not claimed. Event-specific Risk Objects remain a broader product direction rather than part of the current pilot contract.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-7xl px-4 py-14 sm:px-6 sm:py-20">
        <div className="max-w-3xl">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-primary">Trust model</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-[-0.03em] sm:text-4xl">A gate should fail safely when context is weak.</h2>
        </div>
        <div className="mt-9 grid gap-4 md:grid-cols-3">
          <TrustCard icon={Fingerprint} title="Verifiable object" text="Signed, versioned Risk Objects preserve integrity, freshness and methodology context." />
          <TrustCard icon={ShieldCheck} title="Fail-closed" text="Missing, stale, malformed or commercially ineligible required context cannot silently become approval." />
          <TrustCard icon={CheckCircle2} title="Auditable response" text="The recommendation is designed to be correlated with the exact risk context used by the caller." />
        </div>
      </section>

      <section className="border-y border-border/55 bg-card/15">
        <div className="mx-auto w-full max-w-7xl px-4 py-14 sm:px-6 sm:py-20">
          <div className="grid gap-8 lg:grid-cols-[.9fr_1.1fr] lg:items-center">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-primary">Machine boundary</p>
              <h2 className="mt-3 text-3xl font-semibold tracking-[-0.03em]">Built to sit inside a customer-controlled workflow.</h2>
              <p className="mt-4 text-sm leading-7 text-muted-foreground">Geomacro evaluates external-risk context. The customer still owns the identity, permissions, compliance, funds and final action.</p>
            </div>
            <div className="rounded-2xl border border-border/60 bg-background/30 p-5 font-mono text-xs leading-7 text-muted-foreground sm:p-6">
              <div>subject + action context</div>
              <div className="text-primary">↓</div>
              <div>verified Risk Object</div>
              <div className="text-primary">↓</div>
              <div>risk + delta + confidence + drivers</div>
              <div className="text-primary">↓</div>
              <div>CONTINUE / REDUCE_LIMIT / REQUIRE_APPROVAL / PAUSE</div>
              <div className="text-primary">↓</div>
              <div>customer-controlled action</div>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-7xl px-4 py-14 sm:px-6 sm:py-20">
        <div className="overflow-hidden rounded-[1.75rem] border border-primary/20 bg-[linear-gradient(135deg,color-mix(in_oklab,var(--primary)_10%,transparent),transparent_58%)] p-6 sm:p-9 lg:flex lg:items-center lg:justify-between lg:gap-10">
          <div className="max-w-3xl">
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-primary">Design partners</p>
            <h2 className="mt-3 text-2xl font-semibold sm:text-3xl">Have a workflow that should stop, slow down or require review when external risk changes?</h2>
            <p className="mt-3 text-sm leading-7 text-muted-foreground">Bring the action, subject, required freshness and policy boundary. We will map it to the current pilot scope before any integration commitment.</p>
          </div>
          <Button asChild size="lg" className="mt-7 shrink-0 gap-2 lg:mt-0"><Link to="/contact">Discuss a pilot <ArrowRight className="h-4 w-4" /></Link></Button>
        </div>
      </section>
    </main>
  );
}

function TrustCard({ icon: Icon, title, text }: { icon: typeof ShieldCheck; title: string; text: string }) {
  return (
    <article className="rounded-2xl border border-border/60 bg-card/35 p-5 sm:p-6">
      <Icon className="h-5 w-5 text-primary" />
      <h3 className="mt-4 text-lg font-semibold">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{text}</p>
    </article>
  );
}
