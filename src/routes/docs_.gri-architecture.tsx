import { createFileRoute } from "@tanstack/react-router";
import {
  ArrowRight,
  CheckCircle2,
  Database,
  Fingerprint,
  LockKeyhole,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import {
  GRI_HALF_LIFE_HOURS,
  GRI_LOOKBACK_HOURS,
  GRI_METHOD_VERSION,
  GRI_PROOF_VERSION,
  GRI_STORY_CORRELATION_VERSION,
} from "@/lib/gri-current-contract";

export const Route = createFileRoute("/docs_/gri-architecture")({
  head: () => ({
    meta: [
      { title: "GRI Architecture & Proof System · Geomacro" },
      {
        name: "description",
        content:
          "The current Geomacro Global Risk Index architecture: three scoring domains, deterministic source and story caps, recency weighting, change attribution and verifiable proof packages.",
      },
      { property: "og:title", content: "GRI Architecture & Proof System · Geomacro" },
      {
        property: "og:description",
        content:
          "How Geomacro calculates, explains and verifies the current Global Risk Index methodology.",
      },
      { property: "og:url", content: "https://geomacro.live/docs/gri-architecture" },
    ],
    links: [{ rel: "canonical", href: "https://geomacro.live/docs/gri-architecture" }],
  }),
  component: GriArchitecturePage,
});

const DOMAINS = [
  ["Geopolitics", "1/3"],
  ["Macro", "1/3"],
  ["Rare earth / critical minerals", "1/3"],
] as const;

function GriArchitecturePage() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:py-14">
      <a
        href="/docs"
        className="font-mono text-[11px] font-semibold uppercase tracking-wider text-primary hover:underline"
      >
        ← Documentation
      </a>

      <div className="mt-5 flex flex-wrap gap-2">
        <Badge>GRI {GRI_METHOD_VERSION}</Badge>
        <Badge>Proof {GRI_PROOF_VERSION}</Badge>
        <Badge>Story correlation {GRI_STORY_CORRELATION_VERSION}</Badge>
      </div>

      <h1 className="mt-4 text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
        Global Risk Index architecture & proof system
      </h1>
      <p className="mt-5 max-w-4xl text-base leading-relaxed text-muted-foreground sm:text-lg">
        The Global Risk Index (GRI) is a deterministic weighted-intensity index of qualifying
        Geomacro risk evidence after event classification and current-contract story assignment.
        It is designed so a published score can be inspected through its inputs, concentration
        controls, contribution ledger, change attribution and integrity hashes.
      </p>

      <section className="mt-10">
        <SectionTitle eyebrow="System contract" title="One current calculation path" />
        <ArchitectureFlow />
        <div className="mt-5 grid gap-4 md:grid-cols-3">
          <InfoCard title="Observed evidence">
            Source identity or permitted reference, observation time and source provenance.
          </InfoCard>
          <InfoCard title="Model-produced inputs">
            Category, severity and confidence with versioned classification provenance.
          </InfoCard>
          <InfoCard title="Deterministic aggregate">
            Source/story caps, category scores, contribution points and final GRI. No LLM call
            occurs inside numeric aggregation.
          </InfoCard>
        </div>
      </section>

      <section className="mt-12">
        <SectionTitle eyebrow="Definition" title="What GRI measures — and what it does not" />
        <div className="grid gap-4 lg:grid-cols-2">
          <Panel title="GRI is">
            <ProofList
              items={[
                "A 0–100 weighted intensity index of qualifying Geomacro risk evidence.",
                "Deterministic after event classification and current story assignment.",
                "Confidence- and recency-weighted with source and story concentration controls.",
                "Published with coverage, evidence counts, confidence and verification context.",
              ]}
            />
          </Panel>
          <Panel title="GRI is not">
            <ProofList
              items={[
                "A prediction-market probability.",
                "A census of every event in the world.",
                "A claim that missing evidence means zero global risk.",
                "A predictive-performance claim without a separately preserved validation result.",
              ]}
            />
          </Panel>
        </div>
      </section>

      <section className="mt-12">
        <SectionTitle eyebrow="Current domains" title="Three equal base-weight scoring domains" />
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          {DOMAINS.map(([domain, weight]) => (
            <div key={domain} className="rounded-xl border border-border/60 bg-card/30 p-5">
              <p className="text-sm font-semibold text-foreground">{domain}</p>
              <p className="mt-2 font-mono text-sm text-primary">Base weight {weight}</p>
            </div>
          ))}
        </div>
        <p className="mt-4 max-w-4xl text-sm leading-relaxed text-muted-foreground">
          If one domain has no eligible evidence, it is excluded instead of receiving a synthetic
          zero. Remaining active weights are renormalized and coverage is disclosed separately.
          Crypto may exist elsewhere in Geomacro's broader data/technical architecture, but it is
          <strong className="text-foreground"> not a current GRI v1.2 scoring domain</strong>.
        </p>
      </section>

      <section className="mt-12">
        <SectionTitle eyebrow="Eligibility" title="Canonical evidence window and provenance" />
        <p className="mt-4 max-w-4xl text-sm leading-relaxed text-muted-foreground">
          Current GRI observations must satisfy the supported-domain, severity, confidence,
          observation-time, classification-provenance and story-assignment contracts. The trailing
          window is {GRI_LOOKBACK_HOURS} hours and the exponential recency half-life is {GRI_HALF_LIFE_HOURS} hours.
        </p>
        <div className="mt-5 rounded-xl border border-border/60 bg-card/30 p-5 font-mono text-xs leading-6 text-muted-foreground">
          <div>ageHours = (asOf − observedAt) / 1 hour</div>
          <div>rawWeight = (confidence / 100) × 2^(-ageHours / {GRI_HALF_LIFE_HOURS})</div>
        </div>
        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
          The canonical observation time represents when Geomacro knew the observation. Publisher
          time remains provenance and cannot backdate a historical snapshot.
        </p>
      </section>

      <section className="mt-12">
        <SectionTitle eyebrow="Concentration control" title="Source cap, then story cap" />
        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          <Panel title="1. Source cap" icon={Database}>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Within a domain, one stable source receives at most 1.0 total evidence weight. Its
              eligible observations share that budget in proportion to raw weight.
            </p>
            <CodeBlock>sourceEffective = min(1.0, Σ rawWeight)</CodeBlock>
          </Panel>
          <Panel title="2. Story cap" icon={Fingerprint}>
            <p className="text-sm leading-relaxed text-muted-foreground">
              After source capping, observations assigned to the same underlying development share
              one story budget based on the strongest constituent source total, capped at 1.0.
            </p>
            <CodeBlock>storyEffective = min(1.0, strongest post-source source weight)</CodeBlock>
          </Panel>
        </div>
        <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
          Repeated publication from one source or multiple publishers therefore cannot multiply one
          underlying development into unlimited independent evidence weight.
        </p>
      </section>

      <section className="mt-12">
        <SectionTitle eyebrow="Aggregation" title="From effective evidence to the global score" />
        <div className="mt-5 grid gap-4 md:grid-cols-3">
          <FormulaStep n="01" title="Domain score">
            Σ(severity × effectiveEventWeight) / Σ effectiveEventWeight
          </FormulaStep>
          <FormulaStep n="02" title="Active weights">
            Renormalize the 1/3 base weights only across domains with eligible evidence.
          </FormulaStep>
          <FormulaStep n="03" title="Global score">
            GRI raw = Σ(active normalized weight × domain score); display = round(raw).
          </FormulaStep>
        </div>
        <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
          The published snapshot retains higher-precision raw values in addition to the integer
          display score.
        </p>
      </section>

      <section className="mt-12">
        <SectionTitle eyebrow="Change attribution" title="Every material move should reconcile" />
        <div className="mt-5 rounded-xl border border-border/60 bg-card/30 p-5">
          <CodeBlock>
            GRI change = Σ(current contributionᵢ − previous contributionᵢ)
          </CodeBlock>
          <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
            An observation can change contribution because it was added, removed, rescored or
            reweighted by recency, source concentration, story concentration or active-domain
            normalization. The proof preserves the effective weights used by each snapshot and
            records reconciliation/change residuals under the current numeric contract.
          </p>
        </div>
      </section>

      <section className="mt-12">
        <SectionTitle eyebrow="Proof package" title="Published score → contribution ledger → evidence" />
        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          <Panel title="Evidence / classification proof" icon={Database}>
            <ProofList
              items={[
                "Source and observation provenance.",
                "Severity and confidence.",
                "Classification provider/model/version/prompt/input provenance.",
                "Current story assignment and story-correlation provenance.",
              ]}
            />
          </Panel>
          <Panel title="Aggregate / integrity proof" icon={Fingerprint}>
            <ProofList
              items={[
                "Raw, source-capped, story-capped and effective evidence weights.",
                "Domain scores, normalized weights and exact contribution points.",
                "Methodology, input, evidence, calculation and proof hashes.",
                "Disposition/change integrity fields required by the current public contract.",
                "Reconciliation and change residuals.",
              ]}
            />
          </Panel>
        </div>
      </section>

      <section className="mt-12">
        <SectionTitle eyebrow="Publication integrity" title="Draft → verify → immutable publish" />
        <div className="mt-5 grid gap-3 lg:grid-cols-4">
          <Stage icon={Database} title="1. Draft" text="Build a candidate snapshot that is not yet authoritative." />
          <Stage icon={Fingerprint} title="2. Proof" text="Persist contribution, evidence and integrity material required by the contract." />
          <Stage icon={ShieldCheck} title="3. Verify" text="Check contract versions, hashes and reconciliation before publication." />
          <Stage icon={LockKeyhole} title="4. Publish" text="Expose only a qualifying immutable published snapshot through the public read model." />
        </div>
        <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
          A correction should become a new publication or methodology version rather than a silent
          rewrite of historical proof.
        </p>
      </section>

      <section className="mt-12">
        <SectionTitle eyebrow="Validation boundary" title="Proof is not the same as predictive validation" />
        <div className="mt-5 rounded-xl border border-border/60 bg-card/30 p-5">
          <p className="text-sm leading-relaxed text-muted-foreground">
            Deterministic proof demonstrates how a score was calculated. It does not by itself prove
            that the index predicts markets, losses or future geopolitical events. External benchmark,
            historical replay and out-of-sample validation should remain separate from the production
            score calculation and should be claimed only when a preserved run supports the claim.
          </p>
        </div>
      </section>

      <section className="mt-12">
        <SectionTitle eyebrow="Versioning" title="Material numeric changes require a new version" />
        <Panel title="Versioned contract">
          <ProofList
            items={[
              "Scoring domain set or base weights.",
              "Lookback window or recency half-life.",
              "Source/story concentration semantics.",
              "Eligibility and timestamp rules.",
              "Missing-domain normalization.",
              "Rounding or contribution/change-attribution semantics.",
            ]}
          />
        </Panel>
      </section>

      <section className="mt-12 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-6">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-300" />
          <div>
            <h2 className="text-lg font-semibold text-foreground">Public verification model</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Product surfaces can stay readable while the verification path exposes the methodology,
              contribution ledger, evidence context, hashes and change attribution needed to inspect a
              published GRI.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}

function ArchitectureFlow() {
  const nodes = [
    ["Sources", "Evidence + observation time"],
    ["Classification", "Domain · severity · confidence · provenance"],
    ["Story assignment", "Underlying-development correlation"],
    ["GRI engine", "Source cap + story cap + aggregation"],
    ["Proof", "Contribution ledger + hashes"],
    ["Publish", "Verified immutable snapshot"],
  ];

  return (
    <div className="mt-5 overflow-x-auto rounded-xl border border-border/60 bg-card/30 p-4">
      <div className="flex min-w-[840px] items-stretch gap-2">
        {nodes.map(([title, note], index) => (
          <div key={title} className="contents">
            <div className="flex-1 rounded-lg border border-border/60 bg-background/30 p-4">
              <p className="text-sm font-semibold text-foreground">{title}</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{note}</p>
            </div>
            {index < nodes.length - 1 ? (
              <div className="grid place-items-center">
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

function SectionTitle({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div>
      <p className="font-mono text-[10px] font-bold uppercase tracking-[0.15em] text-primary">{eyebrow}</p>
      <h2 className="mt-2 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">{title}</h2>
    </div>
  );
}

function Badge({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-full border border-border/60 bg-muted/20 px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
      {children}
    </span>
  );
}

function InfoCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-border/60 bg-card/30 p-5">
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      <div className="mt-2 text-sm leading-relaxed text-muted-foreground">{children}</div>
    </div>
  );
}

function Panel({ title, icon: Icon, children }: { title: string; icon?: LucideIcon; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-border/60 bg-card/30 p-5">
      {Icon ? <Icon className="mb-3 h-4 w-4 text-primary" /> : null}
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      <div className="mt-3">{children}</div>
    </div>
  );
}

function FormulaStep({ n, title, children }: { n: string; title: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-border/60 bg-card/30 p-4">
      <p className="font-mono text-[10px] text-primary">{n}</p>
      <h3 className="mt-2 text-sm font-semibold text-foreground">{title}</h3>
      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{children}</p>
    </div>
  );
}

function CodeBlock({ children }: { children: ReactNode }) {
  return (
    <div className="mt-3 overflow-x-auto rounded-lg border border-border/50 bg-background/40 p-3 font-mono text-xs text-foreground">
      {children}
    </div>
  );
}

function ProofList({ items }: { items: string[] }) {
  return (
    <ul className="space-y-2">
      {items.map((item) => (
        <li key={item} className="flex items-start gap-2 text-sm leading-relaxed text-muted-foreground">
          <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

function Stage({ icon: Icon, title, text }: { icon: LucideIcon; title: string; text: string }) {
  return (
    <div className="rounded-xl border border-border/60 bg-card/30 p-4">
      <Icon className="h-4 w-4 text-primary" />
      <h3 className="mt-3 text-sm font-semibold text-foreground">{title}</h3>
      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{text}</p>
    </div>
  );
}
