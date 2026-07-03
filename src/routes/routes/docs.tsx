import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  BookOpen,
  Rocket,
  Radio,
  GitBranch,
  Swords,
  Database,
  Map as MapIcon,
  Trophy,
  TerminalSquare,
} from "lucide-react";

export const Route = createFileRoute("/docs")({
  head: () => ({
    meta: [
      { title: "Developer Docs · Geomacro" },
      {
        name: "description",
        content:
          "Technical documentation for Geomacro. Pipeline, Agent Arena, onchain settlement, competitive moat and API reference.",
      },
      { property: "og:title", content: "Developer Docs · Geomacro" },
      {
        property: "og:description",
        content:
          "Geomacro is an autonomous semantic-to-asset translation engine. Read the developer docs.",
      },
    ],
    links: [
      {
        rel: "stylesheet",
        href: "https://cdn.jsdelivr.net/npm/katex@0.16.8/dist/katex.min.css",
      },
    ],
  }),
  component: DocsPage,
});

type TabId =
  | "intro"
  | "quickstart"
  | "feed"
  | "pipeline"
  | "arena"
  | "settlement"
  | "roadmap"
  | "competition"
  | "api";

const SIDEBAR: { id: TabId; label: string; icon: React.ComponentType<{ className?: string }>; group: "guides" | "analysis" | "tools" }[] = [
  { id: "intro", label: "Introduction", icon: BookOpen, group: "guides" },
  { id: "quickstart", label: "Quick Start", icon: Rocket, group: "guides" },
  { id: "feed", label: "Live Feed", icon: Radio, group: "guides" },
  { id: "pipeline", label: "Pipeline", icon: GitBranch, group: "guides" },
  { id: "arena", label: "Agent Arena", icon: Swords, group: "guides" },
  { id: "settlement", label: "Onchain Settlement", icon: Database, group: "guides" },
  { id: "roadmap", label: "Roadmap", icon: MapIcon, group: "guides" },
  { id: "competition", label: "Competitive Moat", icon: Trophy, group: "analysis" },
  { id: "api", label: "API Playground", icon: TerminalSquare, group: "tools" },
];

function loadKatex(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  const w = window as unknown as { katex?: unknown; renderMathInElement?: (el: HTMLElement, opts: unknown) => void };
  if (w.renderMathInElement) return Promise.resolve();
  return new Promise((resolve) => {
    const s1 = document.createElement("script");
    s1.src = "https://cdn.jsdelivr.net/npm/katex@0.16.8/dist/katex.min.js";
    s1.onload = () => {
      const s2 = document.createElement("script");
      s2.src = "https://cdn.jsdelivr.net/npm/katex@0.16.8/dist/contrib/auto-render.min.js";
      s2.onload = () => resolve();
      document.head.appendChild(s2);
    };
    document.head.appendChild(s1);
  });
}

function DocsPage() {
  const [tab, setTab] = useState<TabId>("intro");

  useEffect(() => {
    let cancelled = false;
    loadKatex().then(() => {
      if (cancelled) return;
      const w = window as unknown as { renderMathInElement?: (el: HTMLElement, opts: unknown) => void };
      const root = document.getElementById("docs-content");
      if (root && w.renderMathInElement) {
        w.renderMathInElement(root, {
          delimiters: [
            { left: "$$", right: "$$", display: true },
            { left: "$", right: "$", display: false },
          ],
          throwOnError: false,
        });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [tab]);

  return (
    <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:py-14">
      <div className="flex flex-col gap-8 lg:flex-row">
        {/* Sidebar */}
        <aside className="lg:w-60 lg:flex-shrink-0">
          <div className="sticky top-20 space-y-6">
            <SidebarGroup title="Guides">
              {SIDEBAR.filter((s) => s.group === "guides").map((s) => (
                <SidebarBtn key={s.id} active={tab === s.id} onClick={() => setTab(s.id)} icon={s.icon}>
                  {s.label}
                </SidebarBtn>
              ))}
            </SidebarGroup>
            <SidebarGroup title="Analysis">
              {SIDEBAR.filter((s) => s.group === "analysis").map((s) => (
                <SidebarBtn key={s.id} active={tab === s.id} onClick={() => setTab(s.id)} icon={s.icon}>
                  {s.label}
                </SidebarBtn>
              ))}
            </SidebarGroup>
            <SidebarGroup title="Tools">
              {SIDEBAR.filter((s) => s.group === "tools").map((s) => (
                <SidebarBtn key={s.id} active={tab === s.id} onClick={() => setTab(s.id)} icon={s.icon}>
                  {s.label}
                </SidebarBtn>
              ))}
            </SidebarGroup>
          </div>
        </aside>

        {/* Content */}
        <div id="docs-content" className="min-w-0 flex-1">
          {tab === "intro" && <IntroPane />}
          {tab === "quickstart" && <QuickstartPane />}
          {tab === "feed" && <FeedPane />}
          {tab === "pipeline" && <PipelinePane />}
          {tab === "arena" && <ArenaPane />}
          {tab === "settlement" && <SettlementPane />}
          {tab === "roadmap" && <RoadmapPane />}
          {tab === "competition" && <CompetitionPane />}
          {tab === "api" && <ApiPane />}
        </div>
      </div>
    </main>
  );
}

function SidebarGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-2 px-3 font-mono text-[10px] font-bold uppercase tracking-[0.15em] text-primary">{title}</div>
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
      onClick={onClick}
      className={`flex w-full items-center gap-2 rounded-md border-l-2 px-3 py-2 text-left text-sm transition ${
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
  return <div className="mb-1 font-mono text-[11px] font-bold uppercase tracking-[0.15em] text-primary">{children}</div>;
}
function PageTitle({ children }: { children: React.ReactNode }) {
  return <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">{children}</h1>;
}
function PageSubtitle({ children }: { children: React.ReactNode }) {
  return <p className="mt-3 max-w-3xl text-base text-muted-foreground">{children}</p>;
}
function Divider() {
  return <div className="my-6 h-px bg-border/60" />;
}
function H2({ children }: { children: React.ReactNode }) {
  return <h2 className="mt-8 mb-3 text-xl font-semibold text-foreground">{children}</h2>;
}
function P({ children }: { children: React.ReactNode }) {
  return <p className="mb-4 text-[15px] leading-relaxed text-muted-foreground">{children}</p>;
}
function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-lg border border-border/60 bg-card/40 p-5 ${className}`}>{children}</div>;
}
function MathBlock({ children }: { children: string }) {
  return (
    <div className="my-4 overflow-x-auto rounded-lg border border-border/60 bg-muted/20 px-6 py-5 text-center font-mono text-base text-foreground">
      {children}
    </div>
  );
}
function Code({ children }: { children: React.ReactNode }) {
  return <code className="rounded bg-primary/10 px-1.5 py-0.5 font-mono text-[0.85em] text-primary">{children}</code>;
}
function CodeBlock({ children }: { children: React.ReactNode }) {
  return (
    <pre className="my-3 overflow-x-auto rounded-lg border border-border/60 bg-muted/30 p-4 font-mono text-xs leading-relaxed text-foreground">
      <code>{children}</code>
    </pre>
  );
}
function BadgeShipped() {
  return <span className="rounded-full bg-primary/15 px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-primary">shipped</span>;
}
function BadgeNext() {
  return <span className="rounded-full bg-muted px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-muted-foreground">next</span>;
}

/* ===== Panes ===== */

function IntroPane() {
  const tradSteps = [
    ["01", "News Break", "Unstructured Feed"],
    ["02", "Proposal", "Manual Draft"],
    ["03", "Vetting", "Admin Review"],
    ["04", "Launch Pool", "Manual Setup"],
  ];
  const newSteps = [
    ["01", "Ingest", "~1.5 seconds"],
    ["02", "Adversarial Arena", "Dynamic Pricing"],
    ["03", "AMM Bootstrap", "On-chain Pool"],
    ["04", "Ledger Settle", "Programmable USDC"],
  ];
  return (
    <>
      <SectionLabel>Introduction</SectionLabel>
      <PageTitle>Introduction to Geomacro</PageTitle>
      <PageSubtitle>Autonomous semantic-to-asset translation engine. Concept, motivation and architectural moat.</PageSubtitle>
      <Divider />
      <H2>What is Geomacro and why did we build it?</H2>
      <P>
        Modern information moves at the speed of light. Financial risk hedging infrastructure is bottlenecked by human coordination. Current
        platforms require manual pipeline setups. Community proposals, administrative reviews and oracle resolutions add massive transaction latency.
      </P>
      <P>
        We built <span className="font-medium text-foreground">Geomacro</span> to remove the human gatekeeper. The protocol ingests raw unstructured global
        news, parses it with lightweight LLMs, triggers a structured adversarial debate in our Agent Arena and instantly constructs tradeable narrative
        prediction pools on-chain.
      </P>

      <div className="my-7 overflow-hidden rounded-2xl border border-border/60">
        <div className="border-b border-destructive/30 bg-destructive/5 p-5">
          <div className="mb-3 font-mono text-[10px] font-bold uppercase tracking-[0.15em] text-destructive">
            Traditional paradigm <span className="text-muted-foreground/70">· 12 to 24 hour latency</span>
          </div>
          <FlowRow steps={tradSteps} variant="destructive" />
        </div>
        <div className="flex items-center justify-center gap-4 bg-background/40 px-5 py-2 font-mono text-[10px] tracking-wider">
          <span className="text-destructive">12 to 24 HOURS</span>
          <div className="h-px flex-1 bg-border/60" />
          <span className="text-muted-foreground">VS</span>
          <div className="h-px flex-1 bg-border/60" />
          <span className="text-primary">&lt; 2 SECONDS</span>
        </div>
        <div className="bg-primary/5 p-5">
          <div className="mb-3 font-mono text-[10px] font-bold uppercase tracking-[0.15em] text-primary">
            Geomacro autonomous engine <span className="text-muted-foreground/70">· instant ingestion and settle</span>
          </div>
          <FlowRow steps={newSteps} variant="primary" />
        </div>
      </div>

      <H2>The problems we solve</H2>
      <div className="flex flex-col gap-3">
        <Card>
          <div className="mb-2 font-mono text-[11px] font-bold uppercase tracking-wider text-primary">Example 1. Geopolitical shipping disruption</div>
          <P>
            <span className="text-foreground">Traditional problem:</span> a major shipping corridor is blocked at 02:00 UTC. Traditional prediction markets
            take up to 12 hours to write a proposal, get it approved, configure resolution conditions and deploy a liquidity pool.
          </P>
          <P>
            <span className="text-foreground">Geomacro solution:</span> within 1.5 seconds of the raw news hitting global wire feeds the ingestion system
            parses the payload, validates it through our <Code>geomacro.event.v1</Code> schema, initializes a tradeable contract on-chain and triggers Hawk
            vs Dove agent debates to automatically establish fair-market liquidity pricing.
          </P>
        </Card>
        <Card>
          <div className="mb-2 font-mono text-[11px] font-bold uppercase tracking-wider text-primary">Example 2. Dynamic tariff announcements</div>
          <P>
            <span className="text-foreground">Traditional problem:</span> an unexpected international tariff is announced. Speculators must trade broad,
            imprecise assets like index futures because specific binary contracts don't exist or take too long to launch.
          </P>
          <P>
            <span className="text-foreground">Geomacro solution:</span> the parser isolates the economic scope from the announcement wire. The Agent Arena
            compiles opposite dynamic narrative vectors and instantly prices a specific target-focused on-chain pool with USDC for immediate asset risk
            hedging.
          </P>
        </Card>
      </div>
    </>
  );
}

function FlowRow({ steps, variant }: { steps: string[][]; variant: "primary" | "destructive" }) {
  const accent = variant === "primary" ? "text-primary border-primary/40 bg-primary/15" : "text-destructive border-destructive/40 bg-destructive/10";
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      {steps.map(([n, label, sub], i) => (
        <div key={n} className="flex flex-1 items-center gap-3">
          <div className="flex items-center gap-2">
            <span className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded border font-mono text-[11px] font-bold ${accent}`}>{n}</span>
            <div>
              <div className="text-sm font-semibold text-foreground leading-tight">{label}</div>
              <div className="font-mono text-[11px] text-muted-foreground">{sub}</div>
            </div>
          </div>
          {i < steps.length - 1 && <div className="hidden flex-1 text-center text-muted-foreground/40 sm:block">→</div>}
        </div>
      ))}
    </div>
  );
}

function QuickstartPane() {
  return (
    <>
      <SectionLabel>Getting started</SectionLabel>
      <PageTitle>Quick start guide</PageTitle>
      <PageSubtitle>Integrating Geomacro's semantic data and smart contracts inside your systems.</PageSubtitle>
      <Divider />
      <H2>1. Connect to the live RPC node</H2>
      <P>Configure your execution environment to fetch the latest state transitions directly from validator nodes on Arc Testnet (Chain 5042002).</P>
      <H2>2. Interacting via CLI</H2>
      <P>
        Use the official open-source CLI tools (available in the <Code>geomacro-oracle</Code> repository) to synchronize your data structures.
      </P>
      <CodeBlock>{`# Synchronize all localized nodes with Arc Testnet
geomacro-client --node "https://api.geomacro.live/v1" --sync-all --chain-id 5042002`}</CodeBlock>
      <Card className="mt-4 border-primary/30 bg-primary/5">
        <div className="text-sm text-muted-foreground">
          <span className="font-semibold text-primary">Note:</span> make sure your node balance is capitalized with testnet USDC before executing transaction
          state updates.
        </div>
      </Card>
    </>
  );
}

function FeedPane() {
  return (
    <>
      <SectionLabel>Live feed</SectionLabel>
      <PageTitle>Live feed ingestion</PageTitle>
      <PageSubtitle>Data telemetry, indexing velocity and real-time visualization mechanics.</PageSubtitle>
      <Divider />
      <P>
        The Live Feed page is the primary visual and data interface of the Geomacro protocol. It updates in real-time as the oracle processes global RSS,
        API and social media signals.
      </P>
      <H2>Global Risk Index calculation</H2>
      <P>
        The Global Risk Index (0 to 100) uses a dynamic weighting algorithm that filters and calculates aggregate risk from all active parsed events over a
        sliding temporal window.
      </P>
      <MathBlock>{"$$G_{\\text{index}} = \\sum_{i=1}^{N} \\left( w_i \\cdot \\sigma_i \\cdot V_{\\text{intensity}} \\right)$$"}</MathBlock>
      <div className="mt-2 space-y-1.5 text-sm text-muted-foreground">
        <div className="text-foreground">Where:</div>
        <div>
          <span className="font-mono text-primary">w_i</span> source authority weight. Vetted outlets like Reuters hold higher weight vectors than
          unverified sources.
        </div>
        <div>
          <span className="font-mono text-primary">σ_i</span> content vector deviation over the baseline running average.
        </div>
        <div>
          <span className="font-mono text-primary">V_intensity</span> event intensity parameter generated by the LLM schema parsing layers.
        </div>
      </div>
    </>
  );
}

function PipelinePane() {
  const steps: [string, string, string][] = [
    ["01", "Ingest", "Pull live headlines from NewsAPI across the four buckets we care about"],
    ["02", "Normalize", "Reshape whatever the API hands back into one consistent event"],
    ["03", "Dedupe", "Rolling djb2 hash plus URL fingerprint so the same story doesn't run twice"],
    ["04", "Prefilter", "Drop anything that isn't geo, commodity, macro or crypto"],
    ["05", "Classify", "Hand the survivors to llama-3.3-70b on Groq"],
    ["06", "Score", "Pin a severity, a confidence and how much it moves the global risk number"],
    ["07", "Predict", "Write a falsifiable call with a deadline so we can grade ourselves later"],
    ["08", "Reflect", "Look back at past calls onchain and adjust calibration"],
    ["09", "Arcify", "SHA-256 the event, sign the digest, post it to Arc"],
    ["10", "Judge", "Same main agent ends up refereeing the arena duels"],
  ];
  return (
    <>
      <SectionLabel>Pipeline</SectionLabel>
      <PageTitle>From raw headline to a signed event on Arc</PageTitle>
      <PageSubtitle>
        Ten stages between a story hitting the wire and an attestation landing on Arc. None of them are hidden. You can watch each one as it runs.
      </PageSubtitle>
      <Divider />
      <div className="flex flex-col gap-2">
        {steps.map(([n, name, desc]) => (
          <div key={n} className="flex items-start gap-4 rounded-lg border border-border/60 bg-card/40 p-4">
            <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded border border-primary/40 bg-primary/10 font-mono text-xs font-bold text-primary">
              {n}
            </div>
            <div>
              <span className="font-semibold text-primary">{name}</span>{" "}
              <span className="text-sm text-muted-foreground">= {desc}</span>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function ArenaPane() {
  return (
    <>
      <SectionLabel>Agent Arena</SectionLabel>
      <PageTitle>Agent Arena and narrative marketplace</PageTitle>
      <PageSubtitle>How competitive adversarial AI agents debate geopolitical events and establish asset values.</PageSubtitle>
      <Divider />
      <H2>Adversarial debate logic</H2>
      <P>
        Instead of using subjective editors, Geomacro implements an adversarial game theory framework. Two competing LLM nodes evaluate each ingested news
        payload.
      </P>
      <div className="my-5 grid gap-4 sm:grid-cols-2">
        <Card className="border-destructive/40 bg-destructive/5">
          <div className="mb-2 font-mono text-xs font-bold text-destructive">Agent Hawk. Escalation maximalist</div>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Predicts risk will intensify. Stakes USDC on severity rising or ceasefires breaking. Optimized to identify escalation, systemic volatility and
            supply chain friction.
          </p>
        </Card>
        <Card className="border-primary/40 bg-primary/5">
          <div className="mb-2 font-mono text-xs font-bold text-primary">Agent Dove. De-escalation seeker</div>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Predicts risk will cool. Stakes USDC on de-escalation, mediation, ceasefire holding. Optimized to identify stabilization parameters and
            geopolitical resilience.
          </p>
        </Card>
      </div>
      <H2>The sentiment spread calculation</H2>
      <P>
        The resulting competitive values generate the Sentiment Spread $S_v$, which bounds risk vectors on an interval between $-1.0$ and $1.0$.
      </P>
      <MathBlock>{"$$S_v = \\tanh \\left( H_{\\text{score}} - D_{\\text{score}} \\right)$$"}</MathBlock>
      <P>
        If $S_v$ crosses specified volatility margins, execution smart contracts immediately bootstrap the corresponding USDC pools, setting initial trade
        bounds dynamically on-chain.
      </P>
    </>
  );
}

function SettlementPane() {
  return (
    <>
      <SectionLabel>Onchain</SectionLabel>
      <PageTitle>Onchain Arc and USDC settlement ledger</PageTitle>
      <PageSubtitle>DeFi market formulation, constant-product execution and programmable USDC settlement architecture.</PageSubtitle>
      <Divider />
      <H2>Liquidity pricing model</H2>
      <P>Every narrative market runs on top of a constant-product formulation, establishing continuous liquidity profiles on Arc Testnet.</P>
      <MathBlock>{"$$x \\cdot y = k$$"}</MathBlock>
      <div className="mt-3 space-y-1.5 text-sm text-muted-foreground">
        <div className="text-foreground">Where:</div>
        <div><span className="font-mono text-primary">x</span> reserve of Hawk narrative tokens in the pool.</div>
        <div><span className="font-mono text-primary">y</span> reserve of Dove narrative tokens in the pool.</div>
        <div><span className="font-mono text-primary">k</span> the constant invariant of the pool.</div>
      </div>
      <P>
        When trades process, prices shift programmatically along the constant curve. Because we settle in native USDC on Arc Testnet, developers and smart
        contracts can query or swap assets with predictable execution, zero human mediation and minimized transaction gas.
      </P>
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <Card>
          <div className="mb-3 flex items-center justify-between">
            <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Testnet</span>
            <BadgeShipped />
          </div>
          <div className="space-y-2 text-sm">
            <Row k="Network" v="Arc Testnet" />
            <Row k="Chain ID" v="5042002 (0x4cef52)" />
            <Row k="Currency" v="USDC" highlight />
            <Row k="Explorer" v="testnet.arcscan.app" mono />
          </div>
        </Card>
        <Card className="opacity-60">
          <div className="mb-3 flex items-center justify-between">
            <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Mainnet</span>
            <BadgeNext />
          </div>
          <div className="space-y-2 text-sm">
            <Row k="Network" v="Arc" />
            <Row k="Chain ID" v="5042001 (0x4cef51)" />
            <Row k="Currency" v="USDC" highlight />
            <Row k="Explorer" v="arcscan.app" mono />
          </div>
        </Card>
      </div>
    </>
  );
}

function Row({ k, v, highlight, mono }: { k: string; v: string; highlight?: boolean; mono?: boolean }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{k}</span>
      <span className={`${highlight ? "text-primary" : "text-foreground"} ${mono ? "font-mono text-xs" : ""}`}>{v}</span>
    </div>
  );
}

function RoadmapPane() {
  const items: [string, string, "shipped" | "next"][] = [
    ["v0.1", "Live feed pipeline (NewsAPI + Groq classification)", "shipped"],
    ["v0.2", "Smart contract deployed and verified on Arc Testnet", "shipped"],
    ["v0.3", "Full stake to resolve to claim cycle tested onchain", "shipped"],
    ["v0.4", "Automated market creation via GitHub Actions", "shipped"],
    ["v0.5", "Decentralized dispute-based resolution", "next"],
    ["v0.6", "Mainnet deployment", "next"],
    ["v0.7", "Public agent track record", "next"],
    ["v0.8", "Full iPhone wallet support via WalletConnect for external browsers (Safari/Chrome)", "next"],
  ];
  return (
    <>
      <SectionLabel>Roadmap</SectionLabel>
      <PageTitle>What we've shipped. What's coming.</PageTitle>
      <Divider />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {items.map(([v, label, status]) => (
          <Card key={v}>
            <div className="mb-3 flex items-center justify-between">
              <span className="font-mono text-xs text-muted-foreground">{v}</span>
              {status === "shipped" ? <BadgeShipped /> : <BadgeNext />}
            </div>
            <p className="text-sm font-semibold leading-snug text-foreground">{label}</p>
          </Card>
        ))}
      </div>
    </>
  );
}

function CompetitionPane() {
  return (
    <>
      <SectionLabel>Competitive analysis</SectionLabel>
      <PageTitle>The uncopyable architectural moat</PageTitle>
      <PageSubtitle>Why Geomacro cannot be copied by Polymarket, Kalshi, Limitless or any legacy event market.</PageSubtitle>
      <Divider />
      <H2>Why competitors are structurally trapped</H2>
      <P>
        At first glance, traditional platforms might look like they could spawn an AI agent to emulate our functionality. They are blocked by their core
        state architecture and security trust models.
      </P>
      <div className="my-5 overflow-x-auto rounded-lg border border-border/60">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Feature</th>
              <th className="px-4 py-3">Polymarket / Kalshi</th>
              <th className="px-4 py-3">Limitless</th>
              <th className="px-4 py-3 text-primary">Geomacro</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {[
              ["Market creation", "Human admin / community submission", "Semi-automated templates", "100% autonomous pipeline"],
              ["Liquidity", "Manual market makers / retail pools", "Automated AMM pools", "Programmatic Agent Arena"],
              ["Settlement oracles", "Optimistic oracles (UMA) / human disputes", "Decentralized oracles (Pyth)", "Multi-agent state consensus"],
              ["Core asset class", "Binary speculative event (yes/no)", "Binary prediction tokens", "Dynamic risk and sentiment streams"],
            ].map((row) => (
              <tr key={row[0]}>
                <td className="px-4 py-3 font-medium text-foreground">{row[0]}</td>
                <td className="px-4 py-3 text-muted-foreground">{row[1]}</td>
                <td className="px-4 py-3 text-muted-foreground">{row[2]}</td>
                <td className="px-4 py-3 font-medium text-primary">{row[3]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <H2>The three copy-barriers</H2>
      <div className="flex flex-col gap-3">
        <Card>
          <div className="mb-2 font-mono text-[11px] font-bold uppercase tracking-wider text-primary">1. Consensus trust model barrier</div>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Traditional platforms use optimistic oracles like UMA. These depend on human actors monitoring disputes over 2-hour to 2-day windows. Injecting
            high-frequency autonomous agent triggers would expose them to catastrophic flash-loan attacks, front-running and arbitrage exploits. Rebuilding
            their trust structure requires rewriting their consensus layer from scratch.
          </p>
        </Card>
        <Card>
          <div className="mb-2 font-mono text-[11px] font-bold uppercase tracking-wider text-primary">2. State-machine synchronicity barrier</div>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Traditional prediction structures are asynchronous order-books designed for humans. Geomacro is a fully synchronous multi-agent pipeline
            {" "}{"($E \\rightarrow S_v \\rightarrow \\text{AMM pricing}$)"}. Bots on human platforms still execute inside human timelines. Geomacro runs
            native multi-agent computational sandboxes on Arc's pipeline at the consensus tier.
          </p>
        </Card>
        <Card>
          <div className="mb-2 font-mono text-[11px] font-bold uppercase tracking-wider text-primary">3. Slashing and collusion moat</div>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Traditional systems cannot prevent or penalize colluding automated actors. Geomacro implements cryptographic staking and slashing layers native
            to the validator nodes inside the Agent Arena. Rogue validation parameters automatically trigger asset slashing, enforcing strict mathematical
            safety bounds.
          </p>
        </Card>
      </div>
    </>
  );
}

function ApiPane() {
  const [endpoint, setEndpoint] = useState("post-event");
  const [payload, setPayload] = useState(`{
  "source_feed": "RSS_Macro_Wire_Global",
  "raw_text": "Middle-East oil transit parameters show dynamic volatility metrics crossing variance baseline.",
  "intensity_coefficient": 8.5
}`);
  const [logs, setLogs] = useState<string[]>(["// Terminal initialized. Awaiting API trigger..."]);
  const [status, setStatus] = useState<"IDLE" | "OK" | "ERROR">("IDLE");
  const [latency, setLatency] = useState(0);

  const execute = () => {
    const start = performance.now();
    setLogs((l) => [...l, `> ${endpoint.toUpperCase()} dispatched`]);
    setTimeout(() => {
      const took = Math.round(performance.now() - start);
      setLatency(took);
      setStatus("OK");
      setLogs((l) => [
        ...l,
        `< 200 OK { "event_id": "evt_${Math.random().toString(36).slice(2, 10)}", "indexed_at": "${new Date().toISOString()}" }`,
      ]);
    }, 300 + Math.random() * 400);
  };

  return (
    <>
      <SectionLabel>API explorer</SectionLabel>
      <PageTitle>Interactive API sandbox console</PageTitle>
      <PageSubtitle>Send simulated API requests to Geomacro oracle endpoints and test structured payloads.</PageSubtitle>
      <Divider />
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="flex flex-col gap-4">
          <div>
            <label className="mb-1.5 block font-mono text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Target oracle endpoint
            </label>
            <select
              value={endpoint}
              onChange={(e) => setEndpoint(e.target.value)}
              className="w-full rounded-md border border-border/60 bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary"
            >
              <option value="post-event">POST /v1/events. Initialize narrative market</option>
              <option value="get-consensus">GET /v1/arena/consensus. Query sentiment spread</option>
              <option value="post-vote">POST /v1/arena/vote. Cast programmatic agent stake</option>
            </select>
          </div>
          <div>
            <label className="mb-1.5 block font-mono text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Payload variables</label>
            <textarea
              value={payload}
              onChange={(e) => setPayload(e.target.value)}
              rows={8}
              className="w-full rounded-md border border-border/60 bg-background p-3 font-mono text-xs text-primary outline-none focus:border-primary"
            />
          </div>
          <button
            onClick={execute}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90"
          >
            Execute simulated request
          </button>
        </div>
        <div>
          <label className="mb-1.5 block font-mono text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Response sandbox console</label>
          <div className="flex flex-col rounded-md border border-border/60 bg-background p-4 font-mono text-xs">
            <div className="max-h-56 flex-1 space-y-1.5 overflow-y-auto leading-relaxed">
              {logs.map((l, i) => (
                <div key={i} className={l.startsWith("<") ? "text-primary" : l.startsWith(">") ? "text-foreground" : "text-muted-foreground"}>
                  {l}
                </div>
              ))}
            </div>
            <div className="mt-3 flex justify-between border-t border-border/60 pt-2 text-[10px] text-muted-foreground">
              <span>
                STATUS:{" "}
                <strong className={status === "OK" ? "text-primary" : status === "ERROR" ? "text-destructive" : "text-muted-foreground"}>{status}</strong>
              </span>
              <span>{latency}ms</span>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}