import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { ROADMAP } from "@/lib/roadmap";
import {
  BookOpen,
  Activity,
  BrainCircuit,
  Search,
  Swords,
  Scale,
  Network,
  Database,
  ShieldCheck,
  Building2,
  Map as MapIcon,
  TerminalSquare,
} from "lucide-react";

export const Route = createFileRoute("/docs")({
  head: () => ({
    meta: [
      { title: "Documentation · Geomacro" },
      {
        name: "description",
        content:
          "Official Geomacro documentation covering the live intelligence system, Global Risk Index, Ask Geomacro, HAWK/DOVE markets, V1/V2 contracts, resolution and tribunal lifecycle, USDC settlement, CCTP, data architecture and current limitations.",
      },
      { property: "og:title", content: "Documentation · Geomacro" },
      {
        property: "og:description",
        content:
          "How Geomacro turns real-world geopolitical and macro events into structured intelligence, risk signals, prediction markets and onchain settlement.",
      },
      { property: "og:url", content: "https://geomacro.live/docs" },
    ],
    links: [{ rel: "canonical", href: "https://geomacro.live/docs" }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "TechArticle",
          headline: "Geomacro Documentation",
          url: "https://geomacro.live/docs",
          description:
            "Technical and product documentation for the current Geomacro intelligence and onchain market system.",
          isPartOf: {
            "@type": "WebSite",
            name: "Geomacro",
            url: "https://geomacro.live/",
          },
        }),
      },
    ],
  }),
  component: DocsPage,
});

type TabId =
  | "intro"
  | "product"
  | "intelligence"
  | "ask"
  | "markets"
  | "protocol"
  | "tribunal"
  | "circle"
  | "data"
  | "institutional"
  | "roadmap"
  | "api";

const SIDEBAR: {
  id: TabId;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  group: "overview" | "system" | "reference";
}[] = [
  { id: "intro", label: "Introduction", icon: BookOpen, group: "overview" },
  { id: "product", label: "Live Product", icon: Activity, group: "overview" },
  { id: "intelligence", label: "Intelligence & GRI", icon: BrainCircuit, group: "system" },
  { id: "ask", label: "Ask Geomacro", icon: Search, group: "system" },
  { id: "markets", label: "Markets & Divergence", icon: Swords, group: "system" },
  { id: "protocol", label: "V1 / V2 Protocol", icon: Network, group: "system" },
  { id: "tribunal", label: "Resolution & Tribunal", icon: Scale, group: "system" },
  { id: "circle", label: "USDC, CCTP & Swap", icon: Database, group: "system" },
  { id: "data", label: "Data & Security", icon: ShieldCheck, group: "reference" },
  { id: "institutional", label: "Institutional", icon: Building2, group: "reference" },
  { id: "roadmap", label: "Roadmap", icon: MapIcon, group: "reference" },
  { id: "api", label: "Developer Reference", icon: TerminalSquare, group: "reference" },
];

function DocsPage() {
  const [tab, setTab] = useState<TabId>("intro");

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:py-14">
      <div className="flex flex-col gap-8 lg:flex-row">
        <aside className="lg:w-64 lg:flex-shrink-0">
          <div className="sticky top-20 space-y-6">
            <SidebarGroup title="Overview">
              {SIDEBAR.filter((s) => s.group === "overview").map((s) => (
                <SidebarBtn
                  key={s.id}
                  active={tab === s.id}
                  onClick={() => setTab(s.id)}
                  icon={s.icon}
                >
                  {s.label}
                </SidebarBtn>
              ))}
            </SidebarGroup>
            <SidebarGroup title="System">
              {SIDEBAR.filter((s) => s.group === "system").map((s) => (
                <SidebarBtn
                  key={s.id}
                  active={tab === s.id}
                  onClick={() => setTab(s.id)}
                  icon={s.icon}
                >
                  {s.label}
                </SidebarBtn>
              ))}
              <a
                href="/docs/gri-architecture"
                className="flex min-h-11 w-full items-center gap-2 rounded-md border-l-2 border-transparent px-3 py-2 text-left text-sm text-muted-foreground transition hover:bg-muted/40 hover:text-foreground"
              >
                <ShieldCheck className="h-3.5 w-3.5" />
                <span>GRI Architecture & Proof</span>
              </a>
            </SidebarGroup>
            <SidebarGroup title="Reference">
              {SIDEBAR.filter((s) => s.group === "reference").map((s) => (
                <SidebarBtn
                  key={s.id}
                  active={tab === s.id}
                  onClick={() => setTab(s.id)}
                  icon={s.icon}
                >
                  {s.label}
                </SidebarBtn>
              ))}
            </SidebarGroup>
          </div>
        </aside>

        <div id="docs-content" className="min-w-0 flex-1">
          {tab === "intro" && <IntroPane />}
          {tab === "product" && <ProductPane />}
          {tab === "intelligence" && <IntelligencePane />}
          {tab === "ask" && <AskPane />}
          {tab === "markets" && <MarketsPane />}
          {tab === "protocol" && <ProtocolPane />}
          {tab === "tribunal" && <TribunalPane />}
          {tab === "circle" && <CirclePane />}
          {tab === "data" && <DataPane />}
          {tab === "institutional" && <InstitutionalPane />}
          {tab === "roadmap" && <RoadmapPane />}
          {tab === "api" && <ApiPane />}
        </div>
      </div>
    </div>
  );
}

function SidebarGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-2 px-3 font-mono text-[10px] font-bold uppercase tracking-[0.15em] text-primary">
        {title}
      </div>
      <div className="flex flex-col gap-1">{children}</div>
    </div>
  );
}

function SidebarBtn({
  active,
  onClick,
  icon: Icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex min-h-11 w-full items-center gap-2 rounded-md border-l-2 px-3 py-2 text-left text-sm transition ${
        active
          ? "border-primary bg-primary/10 text-primary"
          : "border-transparent text-muted-foreground hover:bg-muted/40 hover:text-foreground"
      }`}
    >
      <Icon className="h-3.5 w-3.5" />
      <span>{children}</span>
    </button>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-1 font-mono text-[11px] font-bold uppercase tracking-[0.15em] text-primary">
      {children}
    </div>
  );
}
function PageTitle({ children }: { children: React.ReactNode }) {
  return (
    <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">{children}</h1>
  );
}
function PageSubtitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-3 max-w-3xl text-base leading-relaxed text-muted-foreground">{children}</p>
  );
}
function Divider() {
  return <div className="my-6 h-px bg-border/60" />;
}
function H2({ children }: { children: React.ReactNode }) {
  return <h2 className="mb-3 mt-8 text-xl font-semibold text-foreground">{children}</h2>;
}
function H3({ children }: { children: React.ReactNode }) {
  return <h3 className="mb-2 mt-5 text-base font-semibold text-foreground">{children}</h3>;
}
function P({ children }: { children: React.ReactNode }) {
  return <p className="mb-4 text-[15px] leading-relaxed text-muted-foreground">{children}</p>;
}
function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-lg border border-border/60 bg-card/40 p-5 ${className}`}>
      {children}
    </div>
  );
}
function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded bg-primary/10 px-1.5 py-0.5 font-mono text-[0.85em] text-primary">
      {children}
    </code>
  );
}
function CodeBlock({ children }: { children: React.ReactNode }) {
  return (
    <pre className="my-3 overflow-x-auto rounded-lg border border-border/60 bg-muted/30 p-4 font-mono text-xs leading-relaxed text-foreground">
      <code>{children}</code>
    </pre>
  );
}
function Badge({
  children,
  tone = "live",
}: {
  children: React.ReactNode;
  tone?: "live" | "planned" | "legacy";
}) {
  const cls =
    tone === "live"
      ? "bg-emerald-500/10 text-emerald-300"
      : tone === "legacy"
        ? "bg-amber-500/10 text-amber-300"
        : "bg-muted text-muted-foreground";
  return (
    <span
      className={`rounded-full px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider ${cls}`}
    >
      {children}
    </span>
  );
}
function FactGrid({ items }: { items: { label: string; value: string; note?: string }[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {items.map((item) => (
        <Card key={item.label}>
          <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            {item.label}
          </div>
          <div className="mt-2 break-words text-base font-semibold text-foreground">
            {item.value}
          </div>
          {item.note ? (
            <div className="mt-1 text-xs leading-relaxed text-muted-foreground">{item.note}</div>
          ) : null}
        </Card>
      ))}
    </div>
  );
}
function Flow({ items }: { items: string[] }) {
  return (
    <div className="my-5 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
      {items.map((item, index) => (
        <div
          key={item}
          className="relative rounded-lg border border-border/60 bg-muted/20 px-4 py-4"
        >
          <div className="mb-2 font-mono text-[10px] text-primary">
            {String(index + 1).padStart(2, "0")}
          </div>
          <div className="text-sm font-medium text-foreground">{item}</div>
        </div>
      ))}
    </div>
  );
}

function DiagramNode({
  title,
  note,
  tone = "default",
}: {
  title: string;
  note?: string;
  tone?: "default" | "primary" | "success" | "warning";
}) {
  const toneClass =
    tone === "primary"
      ? "border-primary/50 bg-primary/10"
      : tone === "success"
        ? "border-emerald-500/40 bg-emerald-500/10"
        : tone === "warning"
          ? "border-amber-500/40 bg-amber-500/10"
          : "border-border/70 bg-muted/20";
  return (
    <div className={`min-w-0 rounded-lg border px-4 py-3 text-center ${toneClass}`}>
      <div className="text-sm font-semibold text-foreground">{title}</div>
      {note ? (
        <div className="mt-1 text-xs leading-relaxed text-muted-foreground">{note}</div>
      ) : null}
    </div>
  );
}

function DiagramArrow({ label }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-1 text-muted-foreground md:py-0">
      <div className="h-5 w-px bg-border md:h-px md:w-8" />
      {label ? (
        <span className="font-mono text-[9px] uppercase tracking-wider">{label}</span>
      ) : null}
      <span aria-hidden="true" className="rotate-90 text-sm md:rotate-0">
        →
      </span>
    </div>
  );
}

function LinearDiagram({
  items,
}: {
  items: { title: string; note?: string; tone?: "default" | "primary" | "success" | "warning" }[];
}) {
  return (
    <div className="my-5 overflow-x-auto rounded-xl border border-border/60 bg-card/30 p-4">
      <div className="grid min-w-[680px] items-center gap-2 md:grid-flow-col md:auto-cols-fr">
        {items.map((item, index) => (
          <div key={item.title} className="contents">
            <DiagramNode {...item} />
            {index < items.length - 1 ? <DiagramArrow /> : null}
          </div>
        ))}
      </div>
    </div>
  );
}

function RoutingDiagram() {
  return (
    <div className="my-5 rounded-xl border border-border/60 bg-card/30 p-4">
      <div className="mx-auto max-w-3xl">
        <DiagramNode title="Event / position" note="Read stored market_address" tone="primary" />
        <div className="flex justify-center">
          <DiagramArrow />
        </div>
        <DiagramNode
          title="Contract router"
          note="Choose ABI and address from the stored market generation"
        />
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <DiagramNode
            title="V1 legacy path"
            note="Historical markets and positions"
            tone="warning"
          />
          <DiagramNode
            title="V2 current path"
            note="Active proxy, dispute-aware lifecycle"
            tone="success"
          />
        </div>
        <div className="flex justify-center">
          <DiagramArrow />
        </div>
        <DiagramNode
          title="Normalized application state"
          note="Shared UI, lifecycle and portfolio representation"
        />
      </div>
    </div>
  );
}

function TribunalDiagram() {
  const jurors = [
    "Fact-Checker",
    "Hawk Re-arguer",
    "Dove Re-arguer",
    "Evidence Skeptic",
    "Domain Specialist",
  ];
  return (
    <div className="my-5 rounded-xl border border-border/60 bg-card/30 p-4">
      <DiagramNode
        title="Eligible V2 dispute"
        note="Real losing-side stake + open dispute state + required bond"
        tone="primary"
      />
      <div className="flex justify-center">
        <DiagramArrow />
      </div>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
        {jurors.map((juror) => (
          <DiagramNode key={juror} title={juror} />
        ))}
      </div>
      <div className="flex justify-center">
        <DiagramArrow />
      </div>
      <DiagramNode
        title="4-of-5 decision threshold"
        note="Uphold or overturn, then finalize through contract state"
        tone="success"
      />
    </div>
  );
}

function DataBoundaryDiagram() {
  return (
    <div className="my-5 grid gap-3 rounded-xl border border-border/60 bg-card/30 p-4 md:grid-cols-[1fr_auto_1fr] md:items-center">
      <div className="space-y-2">
        <DiagramNode
          title="Supabase read model"
          note="Events, positions, dispute records and public transparency"
          tone="primary"
        />
        <DiagramNode
          title="RLS + least privilege"
          note="Public intelligence separated from wallet-scoped data"
        />
      </div>
      <DiagramArrow label="verify" />
      <div className="space-y-2">
        <DiagramNode
          title="Arc contract state"
          note="Authoritative financial and transaction eligibility state"
          tone="success"
        />
        <DiagramNode
          title="Wallet action boundary"
          note="Connection requested only when the user acts"
        />
      </div>
    </div>
  );
}

function IntroPane() {
  return (
    <>
      <SectionLabel>Official documentation</SectionLabel>
      <PageTitle>Geomacro</PageTitle>
      <PageSubtitle>
        Geopolitical and macro risk intelligence connected to HAWK/DOVE prediction markets, onchain
        resolution and USDC settlement on Arc Testnet.
      </PageSubtitle>
      <Divider />

      <H2>What Geomacro is</H2>
      <P>
        Geomacro is an event-driven intelligence system. It starts with a real-world geopolitical or
        macro event, classifies and scores the event, stores structured intelligence, and can link
        selected events to prediction markets. The same event identity is preserved from
        intelligence through market participation, resolution, dispute state and settlement.
      </P>
      <P>
        The product is deliberately broader than a market interface. A visitor can read the Global
        Risk Index, intelligence, event detail, research, market divergence and institutional
        surfaces without a wallet. A wallet is requested only when the user initiates an onchain
        action.
      </P>

      <H2>The system in one line</H2>
      <LinearDiagram
        items={[
          { title: "Event ingestion" },
          { title: "Structured intelligence", tone: "primary" },
          { title: "HAWK / DOVE market" },
          { title: "Resolution + USDC settlement", tone: "success" },
        ]}
      />

      <H2>Why it exists</H2>
      <P>
        Geomacro is designed around the gap between raw information and an actionable market.
        Instead of treating news, research, risk scoring, prediction and settlement as unrelated
        surfaces, the platform keeps them connected to the same event record.
      </P>

      <H2>What is structurally different</H2>
      <div className="grid gap-3 sm:grid-cols-2">
        {[
          [
            "Event first",
            "The system begins with the event and its intelligence record, not with a manually isolated market question.",
          ],
          [
            "One data lineage",
            "Risk, briefings, convictions, market state, resolution and portfolio state remain linked by the event / market identity.",
          ],
          [
            "Wallet-free intelligence",
            "Reading and research stay available without forcing a wallet connection.",
          ],
          [
            "Market-linked intelligence",
            "HAWK/DOVE participation sits beside the underlying event context rather than replacing it.",
          ],
          [
            "Inspectable resolution",
            "V2 exposes tentative resolution, dispute state, tribunal state, finalization and claim state to the participant.",
          ],
          [
            "Stable settlement layer",
            "The onchain market layer settles in USDC on Arc Testnet, with CCTP and Swap exposed as separate user flows.",
          ],
        ].map(([title, copy]) => (
          <Card key={title}>
            <div className="mb-2 text-sm font-semibold text-foreground">{title}</div>
            <p className="text-sm leading-relaxed text-muted-foreground">{copy}</p>
          </Card>
        ))}
      </div>

      <H2>Current network</H2>
      <FactGrid
        items={[
          { label: "Network", value: "Arc Testnet", note: "Current onchain environment" },
          { label: "Chain ID", value: "5042002" },
          { label: "Settlement asset", value: "USDC" },
          { label: "Current V2 proxy", value: "0x2F874F…56868" },
          { label: "V2 implementation", value: "0x96DDb2…1DA7c" },
          {
            label: "Legacy V1",
            value: "0xC026fD…0FADe",
            note: "Preserved for historical markets and positions",
          },
        ]}
      />
    </>
  );
}

function ProductPane() {
  return (
    <>
      <SectionLabel>Live product</SectionLabel>
      <PageTitle>What users can use today</PageTitle>
      <PageSubtitle>
        The current website exposes intelligence first, with onchain actions added only where they
        are relevant.
      </PageSubtitle>
      <Divider />

      <div className="space-y-3">
        {[
          [
            "Global Risk Index",
            "Versioned aggregate risk score and historical series derived from source- and story-capped, confidence- and recency-weighted event severity.",
          ],
          [
            "Intelligence",
            "Scannable event intelligence with category, severity, movement, timestamps, sources and event detail.",
          ],
          [
            "Ask Geomacro",
            "Supabase-first deterministic research over stored Geomacro intelligence. It does not consume Groq/Cerebras on each user question.",
          ],
          ["Markets / Arena", "HAWK/DOVE markets connected to the events that generated them."],
          [
            "Market divergence",
            "Compares onchain stake-implied HAWK probability with stored Geomacro HAWK conviction when both sides are real.",
          ],
          ["Portfolio", "Wallet positions, claim state and V2 Resolution & Tribunal lifecycle."],
          ["Bridge", "Current CCTP V2 crosschain USDC transfer flow into Arc Testnet."],
          ["Swap", "Current same-chain swap surface exposed alongside Bridge."],
          [
            "Institutional",
            "Live risk, intelligence and research previews, with planned capabilities clearly marked as planned.",
          ],
          [
            "Search / Watchlist / Alerts",
            "Search across live destinations, browser-local following, and local alert preferences with delivery limitations disclosed.",
          ],
        ].map(([title, copy]) => (
          <Card key={title}>
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm font-semibold text-foreground">{title}</div>
              <Badge>live</Badge>
            </div>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{copy}</p>
          </Card>
        ))}
      </div>

      <H2>Transparency rule</H2>
      <P>
        Geomacro does not replace missing values with synthetic zeros and does not invent tribunal
        activity. If a market has no stake-implied probability, if a comparison side is missing, or
        if no dispute was opened, the relevant surface stays unavailable or explicitly says that the
        case was not activated.
      </P>
    </>
  );
}

function IntelligencePane() {
  return (
    <>
      <SectionLabel>Intelligence</SectionLabel>
      <PageTitle>Global Risk Index and event intelligence</PageTitle>
      <PageSubtitle>
        One event layer feeds the risk index, intelligence pages, research, market candidates and
        later lifecycle state.
      </PageSubtitle>
      <Divider />

      <H2>Canonical GRI calculation · v1.1.0</H2>
      <P>
        The Global Risk Index is deterministic after event classification and story assignment.
        Eligible evidence articles in the trailing 72 hours are weighted by model confidence and
        exponential recency decay with a 24-hour half-life. Evidence concentration is controlled in
        two stages: first by source, then by underlying story. Repeated coverage of the same
        development remains visible in the proof ledger but cannot multiply that development's risk
        weight. Category scores are then combined across the four equally weighted domains. Missing
        domains are excluded and disclosed as coverage; they are never converted to zero risk.
      </P>
      <CodeBlock>{`rawWeight = (confidence / 100) × 2^(-ageHours / 24)

sourceEffectiveWeight = min(1.0, Σ rawWeight for source/category)
preStoryEventWeight = sourceEffectiveWeight × articleRawWeight / sourceRawWeight

storyRawWeight = Σ preStoryEventWeight in story
storyStrongestSourceWeight = max(post-source weight by source inside story)
storyEffectiveWeight = min(1.0, storyStrongestSourceWeight)
effectiveEventWeight = storyEffectiveWeight × withinStoryShare

categoryScore = weightedMean(severity, final effectiveEventWeight)
GRI_raw = Σ(normalized active-category weight × categoryScore)
GRI_display = round(GRI_raw)

Methodology = gri-v1.1.0
Proof = gri-proof-v1.1.0
Classifier = event-severity-v1.0.4
Story correlation = story-correlation-v1.0.0
Canonical observation time = created_at
Canonical lookback = 72h
No synthetic fallback, zero-fill or forward-fill.`}</CodeBlock>

      <H2>Audit, proof and change attribution</H2>
      <P>
        Each publication is written as a hidden draft, receives its complete contribution ledger,
        must pass score/change reconciliation, and only then becomes publicly readable. Published
        proof packages are immutable. The public “Verify this GRI” control exposes the exact
        evidence/category change ledger, source, classifier and story-correlation provenance,
        source/story weight chain, methodology/input/evidence/calculation/change/proof hashes, and
        the latest empirical validation status on demand.
      </P>
      <P>
        Comparing contribution points between same-version snapshots decomposes the full score move,
        so a change such as 83 → 63 can be traced point by point. A methodology transition is
        treated as a new baseline rather than being presented as a real-world risk move.
      </P>
      <p className="mb-5">
        <a
          href="/docs/gri-architecture"
          className="text-sm font-semibold text-primary hover:underline"
        >
          Open the complete GRI Architecture & Proof specification →
        </a>
      </p>

      <H2>What an event carries</H2>
      <P>
        The current product uses stored event fields such as category, severity, delta, timestamps,
        source metadata, summaries, narrative / briefing data, market question and lifecycle
        metadata. Not every event has every field, and downstream surfaces are expected to preserve
        that distinction.
      </P>

      <H2>Real stored examples</H2>
      <div className="grid gap-3 md:grid-cols-2">
        <Card>
          <div className="mb-2 font-mono text-[10px] uppercase tracking-wider text-primary">
            V2 market example
          </div>
          <div className="text-sm font-semibold text-foreground">
            Italy / Spain border-control tensions
          </div>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Stored market question: “Will the tensions over Italy's condemnation of Spain’s border
            controls in Ceuta intensify within the next 48 hours?”
          </p>
        </Card>
        <Card>
          <div className="mb-2 font-mono text-[10px] uppercase tracking-wider text-primary">
            V2 market example
          </div>
          <div className="text-sm font-semibold text-foreground">
            Afghanistan / Iran / U.S. / Australia dynamics
          </div>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Stored market question asks whether the situation involving Abbas and the shifting
            regional dynamics will intensify within the next 48 hours.
          </p>
        </Card>
      </div>

      <H2>From event to product surfaces</H2>
      <Flow
        items={[
          "Stored event",
          "GRI contribution",
          "Intelligence / research",
          "Market candidate when eligible",
        ]}
      />
    </>
  );
}

function AskPane() {
  return (
    <>
      <SectionLabel>Research</SectionLabel>
      <PageTitle>Ask Geomacro</PageTitle>
      <PageSubtitle>
        Research over Geomacro’s stored intelligence without spending backend model quota again for
        every user question.
      </PageSubtitle>
      <Divider />

      <H2>Current data flow</H2>
      <LinearDiagram
        items={[
          { title: "Question validation" },
          { title: "Bounded Supabase reads", note: "public.events", tone: "primary" },
          { title: "Deterministic ranking" },
          { title: "Stored-data answer", tone: "success" },
        ]}
      />
      <P>
        Ask Geomacro is Supabase-first. The backend intelligence pipeline may already have used
        model providers to classify and enrich events, but the Ask request path reuses that stored
        work rather than calling Groq or Cerebras again for each visitor question.
      </P>

      <H2>Search and ranking</H2>
      <P>
        The current deterministic engine extracts useful terms and category intent, performs bounded
        reads against <Code>public.events</Code>, and ranks candidates by textual relevance,
        category match, recency, severity and movement. Only the strongest matching records are used
        in the final response.
      </P>
      <CodeBlock>{`question
→ sanitize + validate
→ term extraction + category inference
→ bounded event queries
→ relevance ranking
→ top matching records
→ deterministic response from stored fields`}</CodeBlock>

      <H2>Current query examples</H2>
      <div className="grid gap-3 md:grid-cols-3">
        {[
          "What is happening with rare earths?",
          "What are the highest severity geopolitical risks?",
          "What happened recently in crypto?",
        ].map((q) => (
          <Card key={q}>
            <div className="text-sm text-foreground">{q}</div>
          </Card>
        ))}
      </div>

      <H2>Failure behavior</H2>
      <P>
        If stored Geomacro data is not sufficient to answer a question reliably, the research
        surface says so. It does not silently invent context and it no longer depends on a live
        research-model call being available.
      </P>
    </>
  );
}

function MarketsPane() {
  return (
    <>
      <SectionLabel>Markets</SectionLabel>
      <PageTitle>HAWK / DOVE markets and divergence</PageTitle>
      <PageSubtitle>
        Selected events progress from intelligence into a binary escalation / de-escalation market
        while preserving the event context.
      </PageSubtitle>
      <Divider />

      <H2>HAWK and DOVE</H2>
      <div className="grid gap-3 sm:grid-cols-2">
        <Card>
          <div className="text-sm font-semibold text-foreground">HAWK</div>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Represents the escalation side of the market question.
          </p>
        </Card>
        <Card>
          <div className="text-sm font-semibold text-foreground">DOVE</div>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Represents the de-escalation / containment side of the market question.
          </p>
        </Card>
      </div>

      <H2>Market probability</H2>
      <P>
        The current divergence surface does not treat a fabricated “market probability” as real. It
        derives HAWK probability only when the onchain market has actual staked liquidity on at
        least one side.
      </P>
      <CodeBlock>{`marketHawkProbability = hawkTotalUsdc / (hawkTotalUsdc + doveTotalUsdc) * 100

Skip the row when total staked liquidity is 0.`}</CodeBlock>

      <H2>Geomacro probability</H2>
      <P>
        The comparison side comes from stored briefing convictions already written to Supabase by
        the intelligence backend.
      </P>
      <CodeBlock>{`geomacroHawkProbability = hawk_conviction / (hawk_conviction + dove_conviction) * 100

difference = geomacroHawkProbability - marketHawkProbability`}</CodeBlock>

      <H2>Real divergence behavior</H2>
      <P>
        The section only renders events for which both a real onchain pool probability and a stored
        Geomacro conviction pair exist. At the most recent implementation verification, only three
        currently staked markets qualified, producing divergence readings of approximately -43.7,
        +21.7 and +6.3 percentage points. The set grows automatically as additional markets receive
        stake.
      </P>

      <H2>Why this matters</H2>
      <P>
        Divergence is not presented as proof that either side is correct. It is a comparison between
        two independently derived views: current participant capital allocation and Geomacro’s
        stored HAWK/DOVE conviction balance.
      </P>
    </>
  );
}

function ProtocolPane() {
  return (
    <>
      <SectionLabel>Protocol</SectionLabel>
      <PageTitle>V1 and V2</PageTitle>
      <PageSubtitle>
        Geomacro preserves historical V1 state while routing the current market architecture through
        the active V2 proxy.
      </PageSubtitle>
      <Divider />

      <FactGrid
        items={[
          {
            label: "V2 proxy",
            value: "0x2F874FB07084a22D2bB314D0762Af57Cb1856868",
            note: "Current market address",
          },
          { label: "V2 implementation", value: "0x96DDb29e27bdc3edf0c27bf885840Ebf8151DA7c" },
          { label: "V2 deployment block", value: "56797869" },
          {
            label: "Legacy V1",
            value: "0xC026fDFC40Dcd8F07b6ecFA21b2BF8400Db0FADe",
            note: "Historical markets and positions remain readable",
          },
        ]}
      />

      <H2>Routing rule</H2>
      <P>
        The application does not assume that every position belongs to one contract generation. It
        uses the event / market address to route reads through the correct ABI and normalize the
        result for the frontend.
      </P>
      <RoutingDiagram />

      <H2>Why V1 remains visible</H2>
      <P>
        Existing market and position history should not disappear because the protocol evolved. V1
        is therefore treated as legacy, not erased. V2 adds a richer resolution, dispute and
        tribunal lifecycle while preserving the ability to display older activity accurately.
      </P>

      <H2>Current V2 participant lifecycle</H2>
      <LinearDiagram
        items={[
          { title: "Active" },
          { title: "Tentative resolution", tone: "primary" },
          { title: "Dispute / tribunal" },
          { title: "Finalized + claim", tone: "success" },
        ]}
      />
    </>
  );
}

function TribunalPane() {
  return (
    <>
      <SectionLabel>Resolution</SectionLabel>
      <PageTitle>Resolution and 5-juror tribunal</PageTitle>
      <PageSubtitle>
        V2 separates a tentative AI-assisted outcome from dispute review, finalization and claim
        state.
      </PageSubtitle>
      <Divider />

      <H2>User-visible lifecycle</H2>
      <LinearDiagram
        items={[
          { title: "Active" },
          { title: "Tentative resolution", tone: "primary" },
          { title: "Dispute window" },
          { title: "Tribunal" },
          { title: "Finalized" },
          { title: "Claim / Claimed", tone: "success" },
        ]}
      />
      <P>
        Portfolio exposes this lifecycle on V2 positions so a participant can see what the system
        currently believes, whether a challenge exists, whether a tribunal was activated, and
        whether the market is final.
      </P>

      <H2>Real portfolio examples</H2>
      <div className="grid gap-3 md:grid-cols-2">
        <Card>
          <div className="font-mono text-[10px] uppercase tracking-wider text-primary">
            Stored V2 position
          </div>
          <div className="mt-2 text-sm font-semibold text-foreground">
            Ceuta / Italy-Spain market
          </div>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            A real stored position showed DOVE against a tentative HAWK outcome and later finalized
            without a tribunal case. The UI therefore displayed “Not activated” rather than
            synthetic juror activity.
          </p>
        </Card>
        <Card>
          <div className="font-mono text-[10px] uppercase tracking-wider text-primary">
            Stored V2 position
          </div>
          <div className="mt-2 text-sm font-semibold text-foreground">
            Abbas / regional dynamics market
          </div>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            A real stored DOVE position likewise showed a tentative HAWK outcome and an explicit
            dispute deadline before finalization.
          </p>
        </Card>
      </div>

      <H2>Five review roles</H2>
      <TribunalDiagram />
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {[
          ["Fact-Checker", "Tests factual claims and evidence."],
          ["Hawk Re-arguer", "Builds the strongest escalation case."],
          ["Dove Re-arguer", "Builds the strongest de-escalation case."],
          ["Evidence Skeptic", "Challenges evidence quality and unsupported assumptions."],
          ["Domain Specialist", "Applies event / category-specific context."],
        ].map(([title, copy]) => (
          <Card key={title}>
            <div className="text-sm font-semibold text-foreground">{title}</div>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{copy}</p>
          </Card>
        ))}
      </div>

      <H2>Decision threshold</H2>
      <FactGrid
        items={[
          { label: "Jurors", value: "5" },
          { label: "Decision threshold", value: "4 of 5" },
          { label: "Transparency tables", value: "market_disputes + jury_votes" },
        ]}
      />

      <H2>Important limitation</H2>
      <P>
        A tribunal exists only when an actual eligible dispute is raised. If the dispute table
        contains no case for a market, the product must not imply that five jurors reviewed it. This
        distinction is intentional and visible in Portfolio.
      </P>
    </>
  );
}

function CirclePane() {
  return (
    <>
      <SectionLabel>Circle infrastructure</SectionLabel>
      <PageTitle>USDC, CCTP and Swap</PageTitle>
      <PageSubtitle>
        USDC is the settlement denomination for the market layer, while Bridge and Swap are exposed
        as separate user-facing flows.
      </PageSubtitle>
      <Divider />

      <H2>Why USDC is used</H2>
      <P>
        A HAWK/DOVE position represents a view on an event. Using a stable settlement denomination
        keeps the economic unit separate from unnecessary settlement-asset volatility. On the
        current Arc Testnet deployment, USDC is also used as the native transaction currency.
      </P>

      <H2>CCTP Bridge flow</H2>
      <LinearDiagram
        items={[
          { title: "Choose source + amount" },
          { title: "Burn / transfer message", tone: "primary" },
          { title: "Attestation" },
          { title: "Native USDC on Arc", tone: "success" },
        ]}
      />
      <P>
        The Bridge surface exposes From / To state and transfer status. Wallet access is requested
        only when the user actually begins the transfer.
      </P>

      <H2>Current source testnets</H2>
      <FactGrid
        items={[
          { label: "Source", value: "Ethereum Sepolia" },
          { label: "Source", value: "Base Sepolia" },
          { label: "Source", value: "Avalanche Fuji" },
          { label: "Destination", value: "Arc Testnet" },
        ]}
      />

      <H2>Swap</H2>
      <P>
        The current website also exposes a Swap surface through the existing Circle integration.
        Bridge and Swap are documented separately because they solve different user actions even
        though they share the same liquidity / settlement context.
      </P>
    </>
  );
}

function DataPane() {
  return (
    <>
      <SectionLabel>Data & security</SectionLabel>
      <PageTitle>Source of truth, Supabase and browser boundaries</PageTitle>
      <PageSubtitle>
        The application uses Supabase as a structured read model and transparency layer while
        verifying sensitive financial state onchain.
      </PageSubtitle>
      <Divider />

      <H2>Core data model</H2>
      <div className="grid gap-3 sm:grid-cols-2">
        {[
          [
            "events",
            "Structured intelligence, market metadata, convictions, tentative outcome and lifecycle fields.",
          ],
          [
            "positions",
            "Wallet-scoped position mirror, stake, status, resolved outcome, payout and claim metadata.",
          ],
          [
            "market_disputes",
            "Public dispute-case transparency, bond, tally and final verdict fields.",
          ],
          [
            "jury_votes",
            "Public per-juror role, verdict, reasoning / evidence metadata and transaction reference.",
          ],
          ["wallet_balance_history", "Wallet-scoped balance history."],
          [
            "sync_state / operational tables",
            "Internal synchronization state, not a public product surface.",
          ],
        ].map(([title, copy]) => (
          <Card key={title}>
            <Code>{title}</Code>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{copy}</p>
          </Card>
        ))}
      </div>

      <H2>Current public-read model</H2>
      <P>
        Public intelligence and tribunal transparency are separated from wallet-scoped information.
        Current least-privilege grants expose read access to public intelligence / tribunal data
        while wallet-specific position and balance data remain authenticated and filtered by RLS.
      </P>

      <H2>Data and financial-state boundary</H2>
      <DataBoundaryDiagram />

      <H2>Financial-action rule</H2>
      <P>
        Supabase may suggest what the UI should display, but it is not allowed to become the
        authority for a sensitive onchain action. For example, V2 dispute eligibility is proposed
        from stored lifecycle fields and then confirmed against current contract state and the
        user's actual stake before the transaction is offered.
      </P>

      <H2>Credential boundary</H2>
      <P>
        Service-role keys, signer keys, jury keys, guardian keys and premium RPC credentials belong
        on the trusted server / automation side. Client-visible variables are not used as a place to
        hide privileged credentials.
      </P>
    </>
  );
}

function InstitutionalPane() {
  return (
    <>
      <SectionLabel>Institutional</SectionLabel>
      <PageTitle>One intelligence system, a deeper workflow</PageTitle>
      <PageSubtitle>
        The institutional surface uses the same live risk and event data rather than a separate
        demonstration dataset.
      </PageSubtitle>
      <Divider />

      <H2>Available today</H2>
      <div className="grid gap-3 sm:grid-cols-2">
        {[
          ["Global risk", "Current GRI score and historical series."],
          ["Risk table", "Scored events with real severity, delta, category and timestamps."],
          ["Recent intelligence", "Current stored event intelligence and briefing context."],
          ["Research preview", "Stored briefings and sources linked back to event detail."],
          [
            "Market presence",
            "Market state is shown only where an event actually has a created market.",
          ],
          [
            "Divergence",
            "Rendered only when both market-implied and Geomacro probabilities are real.",
          ],
        ].map(([title, copy]) => (
          <Card key={title}>
            <div className="text-sm font-semibold text-foreground">{title}</div>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{copy}</p>
          </Card>
        ))}
      </div>

      <H2>Clearly marked as planned</H2>
      <P>
        Research exports, structured data access / public API, team access, SSO and workspace
        permissions are not represented as live capabilities. They remain future institutional
        capabilities until the required backend infrastructure exists.
      </P>
    </>
  );
}

function RoadmapPane() {
  return (
    <>
      <SectionLabel>Roadmap</SectionLabel>
      <PageTitle>What is shipped and what is next</PageTitle>
      <PageSubtitle>
        This section reads the same roadmap source used elsewhere in the product.
      </PageSubtitle>
      <Divider />
      {ROADMAP.map((m) => (
        <div key={m.version}>
          <H2>
            <span className="flex flex-wrap items-center gap-3">
              {m.version}, {m.layer} Layer: {m.title}
              <Badge tone={m.status === "shipped" ? "live" : "planned"}>
                {m.status === "shipped" ? "shipped" : "planned"}
              </Badge>
            </span>
          </H2>
          <Card>
            <div className="mb-2 font-mono text-[11px] font-bold uppercase tracking-wider text-primary">
              Objective
            </div>
            <P>{m.objective}</P>
            <div className="mb-2 font-mono text-[11px] font-bold uppercase tracking-wider text-primary">
              Scope
            </div>
            <P>{m.scope}</P>
            <div className="mb-2 font-mono text-[11px] font-bold uppercase tracking-wider text-primary">
              Artifacts
            </div>
            <div className="flex flex-wrap gap-2">
              {m.artifacts.map((a) => (
                <Code key={a}>{a}</Code>
              ))}
            </div>
          </Card>
        </div>
      ))}
    </>
  );
}

function ApiPane() {
  return (
    <>
      <SectionLabel>Developer reference</SectionLabel>
      <PageTitle>Current developer access</PageTitle>
      <PageSubtitle>
        Geomacro does not currently advertise a public hosted data API. Public onchain state can be
        read directly from Arc Testnet.
      </PageSubtitle>
      <Divider />

      <H2>V2 contract</H2>
      <CodeBlock>{`Network: Arc Testnet
Chain ID: 5042002
AgentArenaProxy: 0x2F874FB07084a22D2bB314D0762Af57Cb1856868
AgentArenaV2 implementation: 0x96DDb29e27bdc3edf0c27bf885840Ebf8151DA7c
Legacy V1: 0xC026fDFC40Dcd8F07b6ecFA21b2BF8400Db0FADe
Multicall3: 0xcA11bde05977b3631167028862bE2a173976CA11`}</CodeBlock>

      <H2>Reading market state</H2>
      <P>
        The current frontend uses contract reads and batching rather than a hardcoded market list.
        V1 and V2 require different ABIs and response handling, so integrations should not assume
        one return shape for both generations.
      </P>

      <H2>Public data API</H2>
      <P>
        Structured public data access is not a live product capability today. The institutional
        surface marks it as planned. Developers should not depend on undocumented Supabase internals
        as if they were a stable public API contract.
      </P>

      <H2>Repository and license</H2>
      <P>
        The main Geomacro repository is source-visible under the repository's proprietary license.
        Reusable infrastructure primitives are published separately and governed by the license in
        their own repository.
      </P>
    </>
  );
}
