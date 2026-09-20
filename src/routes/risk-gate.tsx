import { createFileRoute, Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import {
  ArrowRight,
  CheckCircle2,
  Code2,
  KeyRound,
  Route as RouteIcon,
  ShieldCheck,
  TestTube2,
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
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "WebPage",
          name: "Geomacro Risk Gate Private Pilot",
          url: "https://geomacro.live/risk-gate",
          description: DESCRIPTION,
          isPartOf: {
            "@type": "WebSite",
            name: "Geomacro",
            url: "https://geomacro.live/",
          },
        }),
      },
    ],
  }),
  component: RiskGatePage,
});

function RiskGatePage() {
  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 sm:py-14">
      <section className="max-w-5xl">
        <div className="flex flex-wrap items-center gap-2">
          <Badge
            variant="outline"
            className="border-amber-400/40 bg-amber-400/5 font-mono text-[11px] text-amber-300"
          >
            PRIVATE PILOT
          </Badge>
          <Badge
            variant="outline"
            className="border-primary/30 bg-primary/5 font-mono text-[11px]"
          >
            TESTNET
          </Badge>
        </div>

        <h1 className="mt-5 text-4xl font-semibold tracking-tight sm:text-6xl">
          Check external risk before an action moves forward.
        </h1>

        <p className="mt-5 max-w-4xl text-lg leading-relaxed text-muted-foreground">
          Risk Gate turns Geomacro&apos;s verified risk context into a bounded,
          machine-readable pre-flight decision. It can verify a signed Risk
          Object, evaluate country or directional-corridor context, explain the
          risk change, and return a controlled decision before the customer&apos;s
          own system acts.
        </p>

        <div className="mt-8 flex flex-wrap gap-3">
          <Button asChild size="lg" className="gap-2">
            <Link to="/contact">
              Discuss a Private Pilot <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link to="/intelligence">See live intelligence</Link>
          </Button>
          <Button asChild size="lg" variant="ghost">
            <a href="/api/risk-gate-readiness">Check readiness</a>
          </Button>
        </div>

        <p className="mt-5 max-w-4xl text-xs leading-relaxed text-muted-foreground">
          The current implementation is a controlled testnet/private-pilot
          capability, not a generally available production service. Execution
          remains customer-controlled and Geomacro does not sign or submit
          customer transactions.
        </p>
      </section>

      <section className="mt-12 grid gap-4 md:grid-cols-3">
        <StatusCard
          label="LIVE"
          title="Intelligence"
          body="Current geopolitical, macroeconomic and strategic-resource context feeds the broader Geomacro intelligence layer."
          to="/intelligence"
        />
        <StatusCard
          label="PRIVATE PILOT"
          title="Risk Objects"
          body="Signed, versioned machine-readable objects carry risk, attribution, evidence, freshness and integrity context."
          to="/risk-gate"
        />
        <StatusCard
          label="TESTNET"
          title="Risk Gate"
          body="Pre-flight evaluation is being hardened with fail-closed tests before any production launch claim."
          to="/risk-gate"
        />
      </section>

      <section className="mt-14">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-primary">
          What Geomacro can actually do
        </p>
        <h2 className="mt-3 max-w-3xl text-3xl font-semibold tracking-tight">
          Risk context in. Verifiable decision context out.
        </h2>
        <div className="mt-5 rounded-xl border border-border/60 bg-background/30 p-5">
          <p className="text-sm leading-relaxed text-muted-foreground">
            Current Private Pilot scope is country and directional corridor risk.
            Geomacro supports a country or corridor Risk Object, including
            directional corridors composed from endpoints plus eligible bilateral
            evidence. Full physical-route and counterparty modelling are not
            claimed.
          </p>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            Event-specific Risk Objects remain a broader product direction only.
            They are not part of the current Private Pilot contract.
          </p>
        </div>

        <div className="mt-7 grid gap-5 lg:grid-cols-3">
          {[
            [
              "01",
              "Verify the object",
              "Check GRO schema, issuer trust, payload integrity, signature and freshness before using the risk context.",
            ],
            [
              "02",
              "Evaluate the action",
              "Activate relevant country, corridor and exposure modules from the requested workflow and context.",
            ],
            [
              "03",
              "Explain the result",
              "Return current risk, previous state, delta, confidence, coverage, top drivers and threshold triggers.",
            ],
            [
              "04",
              "Apply bounded policy",
              "Evaluate the caller-supplied policy profile and produce CONTINUE, REDUCE_LIMIT, REQUIRE_APPROVAL or PAUSE.",
            ],
            [
              "05",
              "Fail closed",
              "Missing or expired required inputs, commercially ineligible evidence and integrity failures cannot silently become approval.",
            ],
            [
              "06",
              "Preserve auditability",
              "Authenticated evaluations are designed to leave an immutable decision record that can be correlated with the risk context.",
            ],
          ].map(([step, title, body]) => (
            <article
              key={step}
              className="rounded-2xl border border-border/70 bg-card/50 p-6"
            >
              <span className="font-mono text-xs text-primary">CAPABILITY {step}</span>
              <h3 className="mt-3 text-lg font-semibold">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {body}
              </p>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-14 overflow-hidden rounded-2xl border border-border/70 bg-card/50">
        <div className="border-b border-border/70 p-6 sm:p-8">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-primary">
            Testnet workflow
          </p>
          <h2 className="mt-3 text-2xl font-semibold">
            A concrete machine path, without hidden execution authority.
          </h2>
          <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted-foreground">
            The testnet flow is intentionally bounded. A caller asks whether a
            proposed action should be reviewed in the current external-risk
            context. Geomacro returns decision context, not a wallet
            authorization.
          </p>
        </div>

        <div className="grid gap-px bg-border/60 md:grid-cols-4">
          {[
            ["1", "Request", "Country or directional corridor + action context + policy reference"],
            ["2", "Verify", "Signed Risk Object + freshness + methodology + required inputs"],
            ["3", "Evaluate", "Risk score + delta + confidence + coverage + drivers + thresholds"],
            ["4", "Return", "CONTINUE / REDUCE_LIMIT / REQUIRE_APPROVAL / PAUSE"],
          ].map(([step, title, body]) => (
            <div key={step} className="bg-background/80 p-6">
              <span className="font-mono text-xs text-primary">STEP {step}</span>
              <h3 className="mt-3 font-semibold">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {body}
              </p>
            </div>
          ))}
        </div>

        <div className="border-t border-border/70 p-6 sm:p-8">
          <div className="rounded-xl border border-border/60 bg-background/40 p-5">
            <p className="font-mono text-[11px] uppercase tracking-[0.15em] text-muted-foreground">
              Response boundary
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {OUTPUTS.map((output) => (
                <div
                  key={output}
                  className="flex items-center gap-2 rounded-xl border border-border/60 px-4 py-3 font-mono text-sm"
                >
                  <CheckCircle2 className="h-4 w-4 text-primary" />
                  {output}
                </div>
              ))}
            </div>
            <div className="mt-4 rounded-xl border border-border/60 bg-card/40 p-4">
            <p className="font-mono text-xs text-muted-foreground">
              execution_authorized = false
            </p>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              A risk recommendation is not permission to move money. The customer's own identity, permissions and policy layer applies its rules after the Risk Gate response.
            </p>
          </div>
          </div>
        </div>
      </section>

      <section className="mt-14 grid gap-5 md:grid-cols-3">
        <FeatureCard
          icon={<KeyRound className="h-5 w-5 text-primary" />}
          eyebrow="VERIFIABLE"
          title="Signed Risk Objects"
          body="GROs are versioned machine-readable artifacts with Ed25519 issuer verification, canonicalization, freshness and integrity metadata."
        />
        <FeatureCard
          icon={<RouteIcon className="h-5 w-5 text-primary" />}
          eyebrow="ACTION-AWARE"
          title="Country + directional corridor"
          body="The controlled pilot can evaluate country subjects and directional corridor context composed from endpoint risk and eligible bilateral evidence."
        />
        <FeatureCard
          icon={<ShieldCheck className="h-5 w-5 text-primary" />}
          eyebrow="FAIL-CLOSED"
          title="No silent approval"
          body="Stale, missing, malformed, unverifiable or commercially ineligible required context can force a review or PAUSE rather than an implicit CONTINUE."
        />
      </section>

      <section className="mt-14 grid gap-5 lg:grid-cols-[1.05fr_0.95fr]">
        <article className="rounded-2xl border border-border/70 bg-card/50 p-6 sm:p-8">
          <div className="flex items-center gap-3">
            <Code2 className="h-5 w-5 text-primary" />
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-primary">
              MACHINE OUTPUT
            </p>
          </div>
          <h2 className="mt-3 text-2xl font-semibold">
            Built for systems, not just dashboards.
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            The same risk context can be consumed by an API, financial
            workflow, treasury system or autonomous-agent integration. The
            output is designed to be inspected, verified and logged as part of
            the caller&apos;s own decision process.
          </p>
          <div className="mt-6 rounded-xl border border-border/60 bg-background/40 p-5 font-mono text-xs leading-relaxed">
            <div>subject → action_context → policy</div>
            <div>verified Risk Object</div>
            <div>risk + delta + confidence + coverage</div>
            <div>drivers + thresholds + integrity</div>
            <div>decision → customer-controlled action</div>
          </div>
        </article>

        <article className="rounded-2xl border border-border/70 bg-card/50 p-6 sm:p-8">
          <div className="flex items-center gap-3">
            <TestTube2 className="h-5 w-5 text-primary" />
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-amber-300">
              TESTNET FIRST
            </p>
          </div>
          <h2 className="mt-3 text-2xl font-semibold">
            Harden the gate before opening the gate.
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            Current work is focused on source certification, freshness,
            adapter/runtime coverage, Risk Object verification, replay/tamper
            resistance, degraded-state handling and end-to-end testnet
            evidence.
          </p>
          <div className="mt-6 space-y-2 text-sm text-muted-foreground">
            {[
              "source → evidence → Risk Object lineage",
              "freshness and commercial eligibility gates",
              "missing/expired input fail-closed behavior",
              "tamper and replay rejection",
              "audit and integrity verification",
            ].map((item) => (
              <div key={item} className="flex gap-2">
                <span className="text-primary">•</span>
                <span>{item}</span>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="mt-14 rounded-2xl border border-border/70 bg-card/50 p-6 sm:p-8">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-primary">
          Scope boundary
        </p>
        <h2 className="mt-3 text-2xl font-semibold">
          What the current pilot does not claim.
        </h2>
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          {[
            "Full physical-route or port-by-port logistics modelling",
            "Entity-specific sanctions/compliance screening",
            "Counterparty-specific financial exposure validation",
            "Autonomous transaction signing or asset movement",
            "General availability, production SLA or institutional certification",
            "Full activation of every Risk Gate v2 module",
          ].map((item) => (
            <div
              key={item}
              className="rounded-xl border border-border/60 bg-background/30 px-4 py-3 text-sm text-muted-foreground"
            >
              {item}
            </div>
          ))}
        </div>
      </section>

      <section className="mt-14 rounded-2xl border border-primary/25 bg-primary/[0.04] p-7 sm:p-9">
        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-primary">
          DESIGN PARTNERS
        </p>
        <div className="mt-3 flex flex-col justify-between gap-6 md:flex-row md:items-end">
          <div>
            <h2 className="text-2xl font-semibold">
              Test one real decision against the gate.
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              The current route is for controlled testnet/private-pilot
              validation. It is intentionally explicit about what is live,
              what is gated and what remains customer-controlled.
            </p>
          </div>
          <Button asChild size="lg" className="shrink-0">
            <Link to="/contact">Discuss the workflow</Link>
          </Button>
        </div>
      </section>
    </main>
  );
}

function FeatureCard({
  icon,
  eyebrow,
  title,
  body,
}: {
  icon: ReactNode;
  eyebrow: string;
  title: string;
  body: string;
}) {
  return (
    <article className="rounded-2xl border border-border/70 bg-card/50 p-6">
      {icon}
      <p className="mt-4 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
        {eyebrow}
      </p>
      <h2 className="mt-2 text-lg font-semibold">{title}</h2>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{body}</p>
    </article>
  );
}

function StatusCard({
  label,
  title,
  body,
  to,
}: {
  label: string;
  title: string;
  body: string;
  to: "/intelligence" | "/global-risk" | "/risk-gate";
}) {
  return (
    <article className="rounded-2xl border border-border/70 bg-card/40 p-5">
      <p
        className={`font-mono text-[10px] uppercase tracking-[0.16em] ${label === "LIVE" ? "text-primary" : "text-amber-300"}`}
      >
        {label}
      </p>
      <h2 className="mt-2 text-lg font-semibold">{title}</h2>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{body}</p>
      <Button asChild variant="link" className="mt-3 h-auto p-0 text-xs">
        <Link to={to}>
          Learn more <ArrowRight className="ml-1 h-3 w-3" />
        </Link>
      </Button>
    </article>
  );
}
