import { createFileRoute } from "@tanstack/react-router";
import {
  ArrowRight,
  CheckCircle2,
  Database,
  FileCheck2,
  Fingerprint,
  FlaskConical,
  LockKeyhole,
  ShieldCheck,
} from "lucide-react";

export const Route = createFileRoute("/docs_/gri-architecture")({
  head: () => ({
    meta: [
      { title: "GRI Architecture & Proof System · Geomacro" },
      {
        name: "description",
        content:
          "The complete Global Risk Index architecture: evidence provenance, deterministic source and story caps, recency weighting, change attribution, immutable proof packages and empirical validation.",
      },
      { property: "og:title", content: "GRI Architecture & Proof System · Geomacro" },
      {
        property: "og:description",
        content:
          "How Geomacro calculates, explains, proves and validates every Global Risk Index publication.",
      },
      { property: "og:url", content: "https://geomacro.live/docs/gri-architecture" },
    ],
    links: [{ rel: "canonical", href: "https://geomacro.live/docs/gri-architecture" }],
  }),
  component: GriArchitecturePage,
});

const domains = ["Geopolitics", "Macro", "Rare earth / critical minerals", "Crypto"];

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
        <Badge>GRI gri-v1.1.0</Badge>
        <Badge>Proof gri-proof-v1.1.0</Badge>
        <Badge>Classifier event-severity-v1.0.4</Badge>
        <Badge>Story correlation story-correlation-v1.0.0</Badge>
      </div>
      <h1 className="mt-4 text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
        Global Risk Index architecture & proof system
      </h1>
      <p className="mt-5 max-w-4xl text-base leading-relaxed text-muted-foreground sm:text-lg">
        This is the canonical specification for how Geomacro turns accepted evidence articles into
        one Global Risk Index, how repeated coverage is grouped into independent underlying stories,
        why a published score moved, how every point can be reconstructed, and how the methodology
        is tested against external market and macro benchmarks.
      </p>

      <section className="mt-10">
        <SectionTitle
          eyebrow="System contract"
          title="One score, one calculation path, one proof package"
        />
        <ArchitectureFlow />
        <div className="mt-5 grid gap-4 md:grid-cols-3">
          <InfoCard title="Observed fact">
            <p>Original article/source, timestamps and source identity.</p>
          </InfoCard>
          <InfoCard title="Model interpretation">
            <p>Category, severity and confidence with provider/model/prompt/input provenance.</p>
          </InfoCard>
          <InfoCard title="Deterministic aggregate">
            <p>
              Source-capped and story-capped weights, category scores, evidence contribution points
              and final GRI. No LLM call occurs in numeric aggregation.
            </p>
          </InfoCard>
        </div>
      </section>

      <section className="mt-12">
        <SectionTitle eyebrow="Definition" title="What GRI measures — and what it does not claim" />
        <div className="grid gap-4 lg:grid-cols-2">
          <Panel title="GRI is">
            <ul className="space-y-2 text-sm leading-relaxed text-muted-foreground">
              <li>• A 0–100 weighted intensity index of qualifying Geomacro risk evidence.</li>
              <li>• Deterministic after event classification.</li>
              <li>
                • Source- and story-concentration aware, confidence weighted and recency weighted.
              </li>
              <li>
                • Accompanied by coverage, source count, evidence-article count, independent-story
                count and weighted confidence.
              </li>
            </ul>
          </Panel>
          <Panel title="GRI is not">
            <ul className="space-y-2 text-sm leading-relaxed text-muted-foreground">
              <li>• A market probability.</li>
              <li>• A census of every event in the world.</li>
              <li>• A claim that no qualifying event means zero global risk.</li>
              <li>
                • A predictive-performance claim unless a published validation run supports that
                specific statement.
              </li>
            </ul>
          </Panel>
        </div>
      </section>

      <section className="mt-12">
        <SectionTitle eyebrow="Canonical formula" title="From event evidence to GRI" />
        <p className="mt-4 max-w-4xl text-sm leading-relaxed text-muted-foreground">
          Eligibility is evaluated first: supported domain, severity 0–100, confidence above zero,
          and canonical observation time inside the trailing 72-hour window.
        </p>
        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <FormulaStep n="01" title="Event weight">
            <Code>rawWeight = (confidence/100) × 2^(-ageHours/24)</Code>
          </FormulaStep>
          <FormulaStep n="02" title="Source cap">
            <Code>sourceEffective = min(1.0, Σ rawWeight)</Code>
          </FormulaStep>
          <FormulaStep n="03" title="Pre-story allocation">
            <Code>preStoryWeight = sourceEffective × articleRaw/sourceRaw</Code>
          </FormulaStep>
          <FormulaStep n="04" title="Story cap">
            <Code>storyEffective = min(1.0, strongest source weight in story)</Code>
          </FormulaStep>
          <FormulaStep n="05" title="Story allocation">
            <Code>effectiveEventWeight = storyEffective × withinStoryShare</Code>
          </FormulaStep>
          <FormulaStep n="06" title="Category score">
            <Code>Σ(severity × finalWeight) / Σ finalWeight</Code>
          </FormulaStep>
          <FormulaStep n="07" title="Global score">
            <Code>Σ(normalizedDomainWeight × categoryScore)</Code>
          </FormulaStep>
        </div>
        <div className="mt-5 rounded-xl border border-border/60 bg-card/30 p-5">
          <h3 className="text-sm font-semibold text-foreground">Domain base weights</h3>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {domains.map((domain) => (
              <div key={domain} className="rounded-lg border border-border/50 bg-background/30 p-3">
                <p className="text-sm text-foreground">{domain}</p>
                <p className="mt-1 font-mono text-xs text-primary">25%</p>
              </div>
            ))}
          </div>
          <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
            Missing domains are excluded rather than converted to zero risk. Active domain weights
            are normalized and the original base-weight coverage is published separately, so
            composition changes are visible rather than hidden.
          </p>
        </div>
      </section>

      <section className="mt-12">
        <SectionTitle eyebrow="Worked example" title="A complete hypothetical calculation" />
        <p className="max-w-4xl text-sm leading-relaxed text-muted-foreground">
          The values below are an illustrative reproducibility example, not live Geomacro data.
          Snapshot time: <Code>2026-08-30 12:00 UTC</Code>. For simplicity, each evidence article in
          this example represents a different underlying story, so the story cap does not further
          reduce these example weights.
        </p>
        <div className="mt-5 overflow-x-auto rounded-xl border border-border/60">
          <table className="w-full min-w-[760px] text-left text-xs">
            <thead className="bg-muted/20 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="p-3">Evidence article</th>
                <th className="p-3">Domain</th>
                <th className="p-3">Severity</th>
                <th className="p-3">Confidence</th>
                <th className="p-3">Age</th>
                <th className="p-3">Raw weight</th>
                <th className="p-3">GRI contribution</th>
              </tr>
            </thead>
            <tbody>
              {[
                ["G1", "Geopolitics", "90", "90%", "6h", "0.756807", "14.719963"],
                ["G2", "Geopolitics", "70", "80%", "24h", "0.400000", "6.051140"],
                ["M1", "Macro", "60", "85%", "12h", "0.601041", "15.000000"],
                ["R1", "Rare earth", "55", "75%", "18h", "0.445953", "13.750000"],
                ["C1", "Crypto", "40", "95%", "3h", "0.871154", "10.000000"],
              ].map((r) => (
                <tr key={r[0]} className="border-t border-border/50 text-muted-foreground">
                  {r.map((v, i) => (
                    <td key={i} className={`p-3 ${i === 0 ? "font-medium text-foreground" : ""}`}>
                      {v}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Metric label="Geopolitics category" value="83.084411" />
          <Metric label="Geo contribution" value="20.771103" />
          <Metric label="Macro contribution" value="15.000000" />
          <Metric label="Rare earth contribution" value="13.750000" />
          <Metric label="Crypto contribution" value="10.000000" />
        </div>
        <div className="mt-4 rounded-xl border border-primary/30 bg-primary/5 p-5">
          <p className="font-mono text-xs text-muted-foreground">
            20.771103 + 15.000000 + 13.750000 + 10.000000
          </p>
          <p className="mt-2 text-2xl font-semibold text-foreground">
            GRI raw = 59.521103 → display score = 60/100
          </p>
        </div>
      </section>

      <section className="mt-12">
        <SectionTitle eyebrow="Change attribution" title="Why 83 became 63" />
        <p className="max-w-4xl text-sm leading-relaxed text-muted-foreground">
          Geomacro never explains a score move by writing a loose narrative first. It subtracts the
          evidence contribution ledger of the previous same-version snapshot from the current one.
          The narrative is only a readable rendering of that exact arithmetic.
        </p>
        <div className="mt-5 rounded-xl border border-border/60 bg-card/30 p-5">
          <div className="grid gap-3 sm:grid-cols-[1fr_auto_1fr_auto_1fr] sm:items-center">
            <Equation label="Previous raw" value="83.000000" />
            <ArrowRight className="mx-auto h-4 w-4 rotate-90 text-muted-foreground sm:rotate-0" />
            <Equation label="Exact delta" value="−20.000000" />
            <ArrowRight className="mx-auto h-4 w-4 rotate-90 text-muted-foreground sm:rotate-0" />
            <Equation label="Current raw" value="63.000000" />
          </div>
          <div className="mt-5 grid gap-2 sm:grid-cols-2">
            {[
              ["Event removed from 72h window", "−9.800000"],
              ["Existing evidence article decayed / reweighted", "−4.600000"],
              ["Event severity rescored under the same stored input lifecycle", "−3.400000"],
              ["Source/story/category shares rebalanced", "−2.200000"],
            ].map(([label, value]) => (
              <div
                key={label}
                className="flex items-center justify-between gap-4 rounded-lg border border-border/50 bg-background/30 p-3"
              >
                <span className="text-xs text-muted-foreground">{label}</span>
                <span className="font-mono text-xs font-semibold text-emerald-300">{value}</span>
              </div>
            ))}
          </div>
          <p className="mt-4 font-mono text-[10px] text-muted-foreground">
            Illustrative ledger: −9.8 −4.6 −3.4 −2.2 = −20.0. Production proof stores every
            evidence-row delta, category delta, change hash and reconciliation residual.
          </p>
        </div>
      </section>

      <section className="mt-12">
        <SectionTitle
          eyebrow="Two-sided proof"
          title="Why the input exists, and how it became the index"
        />
        <div className="grid gap-4 lg:grid-cols-2">
          <Panel title="A. Event / scoring proof" icon={Database}>
            <ProofList
              items={[
                "Original source URL, title, source identity",
                "Observed timestamp and publisher timestamp",
                "Severity and confidence",
                "Classification provider + model + version + prompt + input hash",
                "Story cluster and canonical label",
                "Story assignment decision + match confidence + rationale",
                "Story-correlation provider + model + version + prompt + input hash + scoring timestamp",
              ]}
            />
          </Panel>
          <Panel title="B. Aggregate / change proof" icon={Fingerprint}>
            <ProofList
              items={[
                "Raw confidence and recency weights",
                "Source cap and pre-story event weight",
                "Story raw weight + strongest-source story weight + story cap",
                "Within-story share + final effective event weight",
                "Category effective weight and score",
                "Normalized category share",
                "Exact evidence contribution points",
                "Methodology/input/evidence/calculation/change/proof hashes",
                "Zero/near-zero reconciliation residual",
              ]}
            />
          </Panel>
        </div>
      </section>

      <section className="mt-12">
        <SectionTitle eyebrow="Publication integrity" title="Draft → verify → immutable publish" />
        <div className="grid gap-3 lg:grid-cols-4">
          <Stage
            icon={Database}
            title="1. Draft"
            text="Snapshot row is not visible to public readers."
          />
          <Stage
            icon={FileCheck2}
            title="2. Ledger"
            text="All evidence contributions and persisted story provenance are written under the draft snapshot."
          />
          <Stage
            icon={ShieldCheck}
            title="3. Reconcile"
            text="Contribution sum and change attribution must reconcile before publication."
          />
          <Stage
            icon={LockKeyhole}
            title="4. Publish"
            text="Status becomes published. Database triggers block later mutation of the snapshot and its ledger."
          />
        </div>
        <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
          A correction is a new publication or methodology version. A published historical proof
          package is never silently rewritten.
        </p>
      </section>

      <section className="mt-12">
        <SectionTitle
          eyebrow="Empirical validation"
          title="Testing usefulness without overstating prediction"
        />
        <div className="grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
          <Panel title="Validation lane" icon={FlaskConical}>
            <ProofList
              items={[
                "External benchmark observations live outside the GRI calculation",
                "Chronological 70% train / 30% test split",
                "24h, 72h and 168h horizons",
                "Pearson and Spearman association",
                "GRI-change vs future benchmark-change correlation",
                "Direction hit-rate where a risk direction is defensible",
                "High-risk false-positive rate",
                "Minimum sample gates before any performance claim",
              ]}
            />
          </Panel>
          <Panel title="Benchmark set">
            <div className="grid gap-2 sm:grid-cols-2">
              {[
                "CBOE VIX",
                "US 30Y Treasury yield",
                "WTI crude oil",
                "Gold",
                "S&P 500",
                "Nominal broad U.S. dollar index",
              ].map((x) => (
                <div
                  key={x}
                  className="rounded-md border border-border/50 bg-background/30 p-3 text-sm text-foreground"
                >
                  {x}
                </div>
              ))}
            </div>
            <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
              Validation reports sample count and test split with every metric. Correlation is never
              described as causation. A completed validation run does not alter GRI values; it only
              measures how the fixed methodology behaves against external observations.
            </p>
          </Panel>
        </div>
      </section>

      <section className="mt-12">
        <SectionTitle eyebrow="Versioning" title="What requires a new methodology version" />
        <div className="rounded-xl border border-border/60 bg-card/30 p-5">
          <ProofList
            items={[
              "Domain set or base weights",
              "72-hour eligibility window",
              "24-hour recency half-life",
              "Confidence weighting rule",
              "Per-source cap",
              "Story-correlation or assignment semantics",
              "Story-cap or within-story allocation rule",
              "Observation timestamp semantics",
              "Missing-domain treatment",
              "Rounding/display rule",
            ]}
          />
          <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
            UI wording, proof visualization and validation tooling can evolve independently. Any
            change that can change the numeric GRI for the same inputs must increment the
            methodology version and begin a new comparable series.
          </p>
        </div>
      </section>

      <section className="mt-12 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-6">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-300" />
          <div>
            <h2 className="text-lg font-semibold text-foreground">Public verification model</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Normal product surfaces stay clean. Anyone who wants to inspect a score can open{" "}
              <strong className="text-foreground">Verify this GRI</strong> to see the exact
              current-score ledger, exact change ledger, evidence provenance, hashes and latest
              validation status.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}

function ArchitectureFlow() {
  const nodes = [
    ["Sources", "Original evidence + timestamps"],
    ["Classification", "Category · severity · confidence · provenance"],
    ["Story correlation", "Group evidence articles by underlying development + persist provenance"],
    ["GRI engine", "Deterministic source cap + story cap + category aggregation"],
    ["Proof draft", "Snapshot + contribution ledger"],
    ["Verification", "Reconcile + hash"],
    ["Immutable publish", "Canonical score + hidden proof UI"],
  ];
  return (
    <div className="mt-5 overflow-x-auto rounded-xl border border-border/60 bg-card/30 p-4">
      <div className="flex min-w-[980px] items-stretch gap-2">
        {nodes.map(([title, note], i) => (
          <div key={title} className="contents">
            <div className="flex-1 rounded-lg border border-border/60 bg-background/30 p-4">
              <p className="text-sm font-semibold text-foreground">{title}</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{note}</p>
            </div>
            {i < nodes.length - 1 ? (
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
      <p className="font-mono text-[10px] font-bold uppercase tracking-[0.15em] text-primary">
        {eyebrow}
      </p>
      <h2 className="mt-2 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
        {title}
      </h2>
    </div>
  );
}
function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border border-border/60 bg-muted/20 px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
      {children}
    </span>
  );
}
function InfoCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border/60 bg-card/30 p-5">
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      <div className="mt-2 text-sm leading-relaxed text-muted-foreground">{children}</div>
    </div>
  );
}
function Panel({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon?: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-card/30 p-5">
      {Icon ? <Icon className="mb-3 h-4 w-4 text-primary" /> : null}
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      <div className="mt-3">{children}</div>
    </div>
  );
}
function FormulaStep({
  n,
  title,
  children,
}: {
  n: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-card/30 p-4">
      <p className="font-mono text-[10px] text-primary">{n}</p>
      <h3 className="mt-2 text-sm font-semibold text-foreground">{title}</h3>
      <div className="mt-2 text-xs leading-relaxed text-muted-foreground">{children}</div>
    </div>
  );
}
function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded bg-primary/10 px-1.5 py-0.5 font-mono text-[0.9em] text-primary">
      {children}
    </code>
  );
}
function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/50 bg-card/30 p-3">
      <p className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-1 font-mono text-sm font-semibold text-foreground">{value}</p>
    </div>
  );
}
function Equation({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/50 bg-background/30 p-4 text-center">
      <p className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-1 font-mono text-lg font-semibold text-foreground">{value}</p>
    </div>
  );
}
function ProofList({ items }: { items: string[] }) {
  return (
    <ul className="space-y-2">
      {items.map((item) => (
        <li
          key={item}
          className="flex items-start gap-2 text-sm leading-relaxed text-muted-foreground"
        >
          <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}
function Stage({
  icon: Icon,
  title,
  text,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  text: string;
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-card/30 p-4">
      <Icon className="h-4 w-4 text-primary" />
      <h3 className="mt-3 text-sm font-semibold text-foreground">{title}</h3>
      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{text}</p>
    </div>
  );
}
