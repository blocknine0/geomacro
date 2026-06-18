import { createFileRoute } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import heroBg from "@/assets/hero-bg.jpg";
import { useWallet } from "@/hooks/use-wallet";
import { ARC_NETWORKS, preferredNetwork, SAMPLE_EVENTS } from "@/lib/arc";
import { AGENTS, SAMPLE_MARKETS, type AgentSide, type Market } from "@/lib/agents";
import { runAgentDuel } from "@/lib/agents.functions";
import { mainAgentJudge } from "@/lib/arena-judge.functions";
import { rememberSessionTx } from "@/lib/wallet-tx";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowUpRight, Activity, ShieldCheck, Radio, Wallet, Link2, Zap, Swords, Bot, Gavel, Loader2, Brain, Clock } from "lucide-react";
import { AutonomousOracle } from "@/components/autonomous-oracle";
import { LiveNewsFeed } from "@/components/live-news-feed";
import { WalletTxFeed } from "@/components/wallet-tx-feed";
import type { FeedEvent } from "@/lib/live-feed.functions";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Geomacro — Onchain Geopolitical Risk Oracle on Arc" },
      { name: "description", content: "AI-classified geopolitical events published onchain to the Arc testnet. Connect a wallet to verify, subscribe, and act." },
      { property: "og:title", content: "Geomacro — Onchain Geopolitical Risk Oracle on Arc" },
      { property: "og:description", content: "AI-classified geopolitical events published onchain to the Arc testnet." },
      { property: "og:url", content: "https://geomacrooracle.lovable.app/" },
    ],
    links: [
      { rel: "canonical", href: "https://geomacrooracle.lovable.app/" },
    ],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "WebApplication",
          name: "Geomacro",
          url: "https://geomacrooracle.lovable.app/",
          applicationCategory: "FinanceApplication",
          operatingSystem: "Web",
          description:
            "AI-classified geopolitical and macro events published onchain to the Arc network.",
          offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
        }),
      },
    ],
  }),
  component: Index,
});

function shortAddr(a: string) { return `${a.slice(0, 6)}…${a.slice(-4)}`; }

function formatCountdown(ms: number) {
  if (ms <= 0) return "0s";
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

function ConnectButton() {
  const { address, onArc, network, connect, switchToArc, connecting, error } = useWallet();
  if (!address) {
    return (
      <div className="flex flex-col items-end gap-1">
        <Button onClick={connect} disabled={connecting} className="gap-2">
          <Wallet className="h-4 w-4" />
          {connecting ? "Connecting…" : "Connect Wallet"}
        </Button>
        {error && <span className="text-xs text-destructive max-w-xs text-right">{error}</span>}
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2">
      {!onArc && (
        <Button variant="outline" size="sm" onClick={() => void switchToArc()} className="gap-1">
          <Zap className="h-3.5 w-3.5" /> Switch to Arc
        </Button>
      )}
      <Badge variant={onArc ? "default" : "secondary"} className="gap-1.5 px-3 py-1.5 font-mono">
        <span className={`h-1.5 w-1.5 rounded-full ${onArc ? "bg-primary" : "bg-muted-foreground"}`} />
        {network ? network.chainName : "Wrong network"} · {shortAddr(address)}
      </Badge>
    </div>
  );
}

function Index() {
  const { address, onArc, network, connect, switchToArc } = useWallet();
  const activeNet = network ?? preferredNetwork();
  const [publishing, setPublishing] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const duel = useServerFn(runAgentDuel);
  const judge = useServerFn(mainAgentJudge);
  const [duelLoading, setDuelLoading] = useState<string | null>(null);
  const [duelError, setDuelError] = useState<string | null>(null);
  const [duels, setDuels] = useState<Record<string, Awaited<ReturnType<typeof runAgentDuel>>>>({});
  const [verdicts, setVerdicts] = useState<Record<string, Awaited<ReturnType<typeof mainAgentJudge>>>>({});
  const [judging, setJudging] = useState<string | null>(null);
  const [stakeTx, setStakeTx] = useState<Record<string, { side: AgentSide; hash: string }>>({});
  const [deadlines, setDeadlines] = useState<Record<string, number>>({});
  const [now, setNow] = useState<number>(() => Date.now());
  const autoJudgedRef = useRef<Set<string>>(new Set());

  // Restore persisted prediction windows + verdicts from localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem("geomacro.judge.v1");
      if (!raw) return;
      const parsed = JSON.parse(raw) as {
        deadlines?: Record<string, number>;
        duels?: Record<string, Awaited<ReturnType<typeof runAgentDuel>>>;
        verdicts?: Record<string, Awaited<ReturnType<typeof mainAgentJudge>>>;
      };
      if (parsed.deadlines) setDeadlines(parsed.deadlines);
      if (parsed.duels) setDuels(parsed.duels);
      if (parsed.verdicts) setVerdicts(parsed.verdicts);
    } catch { /* ignore */ }
  }, []);

  // Persist on change
  useEffect(() => {
    try {
      localStorage.setItem(
        "geomacro.judge.v1",
        JSON.stringify({ deadlines, duels, verdicts }),
      );
    } catch { /* ignore */ }
  }, [deadlines, duels, verdicts]);

  // 1s ticker drives countdowns + auto-judge trigger
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Auto-judge whenever a market's 24h window elapses
  useEffect(() => {
    for (const m of SAMPLE_MARKETS) {
      const dl = deadlines[m.id];
      if (!dl || now < dl) continue;
      if (verdicts[m.id]) continue;
      if (!duels[m.id]) continue;
      if (judging === m.id) continue;
      if (autoJudgedRef.current.has(m.id)) continue;
      autoJudgedRef.current.add(m.id);
      void judgeMarket(m);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [now, deadlines, duels, verdicts, judging]);

  const totalRisk = useMemo(
    () => Math.round(SAMPLE_EVENTS.reduce((a, e) => a + e.severity, 0) / SAMPLE_EVENTS.length),
    [],
  );

  async function publishOnchain(eventId: string) {
    if (!address) { await connect(); return; }
    if (!onArc) { await switchToArc(); return; }
    setPublishing(eventId);
    setTxHash(null);
    try {
      const eth = window.ethereum!;
      const data = "0x" + Array.from(new TextEncoder().encode(eventId))
        .map((b) => b.toString(16).padStart(2, "0")).join("");
      const hash = (await eth.request({
        method: "eth_sendTransaction",
        params: [{ from: address, to: address, value: "0x0", data }],
      })) as string;
      setTxHash(hash);
      rememberSessionTx(activeNet, address, {
        hash, from: address, to: address, valueWei: "0",
        timestamp: Math.floor(Date.now() / 1000), blockNumber: null, input: data,
      });
    } catch (e) {
      console.warn("publish failed", e);
    } finally {
      setPublishing(null);
    }
  }

  async function publishLiveEvent(e: FeedEvent) {
    return publishOnchain(e.sourceUrl);
  }

  async function runDuel(m: Market) {
    const evt = SAMPLE_EVENTS.find((e) => e.id === m.eventId);
    if (!evt) return;
    setDuelLoading(m.id);
    setDuelError(null);
    try {
      const res = await duel({
        data: {
          marketId: m.id,
          question: m.question,
          threshold: m.threshold,
          eventNarrative: evt.narrative,
          eventSeverity: evt.severity,
          eventStage: evt.stage,
        },
      });
      setDuels((prev) => ({ ...prev, [m.id]: res }));
      // Start the 24h prediction window
      setDeadlines((prev) => ({ ...prev, [m.id]: Date.now() + 24 * 60 * 60 * 1000 }));
      setVerdicts((prev) => {
        const next = { ...prev };
        delete next[m.id];
        return next;
      });
      autoJudgedRef.current.delete(m.id);
    } catch (e) {
      console.warn("agent duel error", e);
      setDuelError("Agent duel unavailable. Please try again in a moment.");
    } finally {
      setDuelLoading(null);
    }
  }

  async function stakeOnArc(market: Market, side: AgentSide) {
    if (!address) { await connect(); return; }
    if (!onArc) { await switchToArc(); return; }
    try {
      const eth = window.ethereum!;
      const payload = `stake:${market.id}:${side}:${AGENTS[side].address}`;
      const data = "0x" + Array.from(new TextEncoder().encode(payload))
        .map((b) => b.toString(16).padStart(2, "0")).join("");
      const hash = (await eth.request({
        method: "eth_sendTransaction",
        params: [{ from: address, to: address, value: "0x0", data }],
      })) as string;
      setStakeTx((prev) => ({ ...prev, [market.id]: { side, hash } }));
      rememberSessionTx(activeNet, address, {
        hash, from: address, to: address, valueWei: "0",
        timestamp: Math.floor(Date.now() / 1000), blockNumber: null, input: data,
      });
    } catch (e) {
      console.warn("stake failed", e);
    }
  }

  async function judgeMarket(m: Market) {
    const duelRes = duels[m.id];
    if (!duelRes) {
      setDuelError("Run the AI duel first so the main agent has positions to judge.");
      return;
    }
    const evt = SAMPLE_EVENTS.find((e) => e.id === m.eventId);
    setJudging(m.id);
    setDuelError(null);
    try {
      const v = await judge({
        data: {
          marketId: m.id,
          question: m.question,
          topic: evt?.narrative ?? m.question,
          threshold: m.threshold,
          hawk: {
            side: duelRes.hawk.side,
            confidence: duelRes.hawk.confidence,
            stakeUsdc: duelRes.hawk.stakeUsdc,
            rationale: duelRes.hawk.rationale,
          },
          dove: {
            side: duelRes.dove.side,
            confidence: duelRes.dove.confidence,
            stakeUsdc: duelRes.dove.stakeUsdc,
            rationale: duelRes.dove.rationale,
          },
          pastCalibration: null,
        },
      });
      setVerdicts((p) => ({ ...p, [m.id]: v }));
    } catch (e) {
      console.warn("judge failed", e);
      setDuelError("Main agent unavailable. Try again in a moment.");
    } finally {
      setJudging(null);
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Nav */}
      <header className="sticky top-0 z-50 border-b border-border/60 bg-background/70 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
          <div className="flex items-center gap-2.5">
            <div className="h-7 w-7 rounded-md bg-gradient-to-br from-primary to-accent" />
            <span className="font-mono text-sm tracking-tight">GEOMACRO<span className="text-primary">.</span>arc</span>
          </div>
          <nav className="hidden gap-8 text-sm text-muted-foreground md:flex">
            <a href="#feed" className="hover:text-foreground transition">Live Feed</a>
            <a href="#oracle" className="hover:text-foreground transition">Oracle</a>
            <a href="#arena" className="hover:text-foreground transition">Agent Arena</a>
            <a href="#pipeline" className="hover:text-foreground transition">Pipeline</a>
            <a href="#onchain" className="hover:text-foreground transition">Onchain</a>
            <a href="#roadmap" className="hover:text-foreground transition">Roadmap</a>
          </nav>
          <ConnectButton />
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <img
          src={heroBg}
          alt=""
          width={1920}
          height={1088}
          className="absolute inset-0 h-full w-full object-cover opacity-50"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-background/40 via-background/70 to-background" />
        <div className="relative mx-auto max-w-7xl px-6 pt-24 pb-32">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7 }}
            className="max-w-3xl"
          >
            <Badge variant="outline" className="mb-6 gap-2 border-primary/40 bg-primary/5 px-3 py-1 font-mono text-xs text-primary">
              <Radio className="h-3 w-3" /> LIVE · {activeNet.chainName} · Chain {activeNet.chainIdDec}
            </Badge>
            <h1 className="text-balance text-5xl font-semibold leading-[1.05] tracking-tight md:text-7xl">
              We read the world&apos;s news,{" "}
              <span className="bg-gradient-to-r from-primary via-accent to-primary bg-clip-text text-transparent">
                grade the risk
              </span>
              , and sign it onchain.
            </h1>
            <p className="mt-6 max-w-2xl text-lg text-muted-foreground">
              GEOMACRO watches what&apos;s happening across geopolitics, commodities, macro
              and crypto, gives every story a clear severity score, and posts the receipt to
              Arc so anyone — funds, apps, or curious people — can check our work.
            </p>
            <div className="mt-10 flex flex-wrap gap-3">
              <Button size="lg" onClick={() => document.getElementById("feed")?.scrollIntoView({ behavior: "smooth" })} className="gap-2">
                Explore Live Feed <ArrowUpRight className="h-4 w-4" />
              </Button>
              <Button size="lg" variant="outline" asChild>
                <a href={activeNet.explorer} target="_blank" rel="noreferrer" className="gap-2">
                  <Link2 className="h-4 w-4" /> Open Arcscan
                </a>
              </Button>
            </div>

            <dl className="mt-16 grid max-w-2xl grid-cols-3 gap-6 border-t border-border/60 pt-8">
              <Stat label="Global Risk Index" value={totalRisk} suffix="/100" accent />
              <Stat label="Events / 24h" value={1284} />
              <Stat label="Sources" value={47} />
            </dl>
          </motion.div>
        </div>
      </section>

      {/* Live Feed */}
      <section id="feed" className="mx-auto max-w-7xl px-6 py-24">
        <SectionHeader
          eyebrow="Live Feed"
          title="What the world is talking about, right now"
          desc="Fresh stories across geopolitics, rare earth, macro and crypto. Each card gets a stage, severity and confidence score so you can skim the day in a minute."
        />
        <div className="mt-12">
          <LiveNewsFeed onPublish={publishLiveEvent} publishingId={publishing} />
        </div>

        {txHash && (
          <div className="mt-6 rounded-xl border border-primary/40 bg-primary/5 p-4 font-mono text-sm">
            <div className="text-primary">✓ Signed onto {activeNet.chainName}</div>
            <a
              href={`${activeNet.explorer}/tx/${txHash}`}
              target="_blank"
              rel="noreferrer"
              className="mt-1 block break-all text-xs text-muted-foreground hover:text-foreground"
            >
              {txHash}
            </a>
          </div>
        )}
      </section>

      {/* Pipeline */}
      <section id="pipeline" className="border-y border-border/60 bg-card/20">
        <div className="mx-auto max-w-7xl px-6 py-24">
          <SectionHeader
            eyebrow="Pipeline"
            title="How a headline becomes a signed event"
            desc="Ten steps, all visible. From the moment a story lands to the moment it&apos;s posted on Arc, you can watch every stage."
          />
          <ol className="mt-12 grid gap-px overflow-hidden rounded-2xl border border-border/60 bg-border/60 md:grid-cols-3 lg:grid-cols-5">
            {[
              ["01", "Ingest", "Firecrawl live search across 4 categories"],
              ["02", "Normalize", "Coerce raw ingestion shapes"],
              ["03", "Dedupe", "djb2 rolling window + URL hash"],
              ["04", "Prefilter", "Geo / commodity / macro / crypto keywords"],
              ["05", "Classify", "Gemini via Lovable AI Gateway"],
              ["06", "Score", "Severity + confidence + Risk Δ"],
              ["07", "Predict", "Falsifiable narrative w/ horizon"],
              ["08", "Reflect", "Self-grade vs onchain history"],
              ["09", "Arcify", "SHA-256 digest signed on Arc"],
              ["10", "Judge", "Main agent verdicts arena duels"],
            ].map(([num, name, desc]) => (
              <li key={num} className="bg-background p-6">
                <div className="font-mono text-xs text-primary">{num}</div>
                <div className="mt-3 text-base font-medium">{name}</div>
                <div className="mt-1 text-xs text-muted-foreground">{desc}</div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Autonomous Oracle — self-learning agent */}
      <AutonomousOracle />

      {/* Agent Arena — AI vs AI prediction market */}
      <section id="arena" className="mx-auto max-w-7xl px-6 py-24">
        <SectionHeader
          eyebrow="Agent Arena"
          title="Two agents argue. One settles it on Arc."
          desc="A hawk and a dove take opposite sides of a market. The main agent reads the live news, picks a winner after 24 hours, and pays out in USDC."
        />

        <div className="mt-12 grid gap-4 md:grid-cols-2">
          {(Object.keys(AGENTS) as AgentSide[]).map((k) => {
            const a = AGENTS[k];
            const tone = a.color === "destructive"
              ? "border-destructive/40 bg-destructive/5"
              : "border-primary/40 bg-primary/5";
            const dot = a.color === "destructive" ? "bg-destructive" : "bg-primary";
            return (
              <div key={a.id} className={`rounded-2xl border ${tone} p-6`}>
                <div className="flex items-center gap-3">
                  <div className={`flex h-10 w-10 items-center justify-center rounded-full ${dot}/15`}>
                    <Bot className={`h-5 w-5 ${a.color === "destructive" ? "text-destructive" : "text-primary"}`} />
                  </div>
                  <div>
                    <div className="text-base font-medium">{a.name}</div>
                    <div className="font-mono text-xs text-muted-foreground">{a.tagline}</div>
                  </div>
                </div>
                <p className="mt-4 text-sm text-muted-foreground">{a.bias}</p>
                <div className="mt-4 break-all border-t border-border/40 pt-3 font-mono text-[10px] text-muted-foreground">
                  {a.address}
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-10 space-y-4">
          {SAMPLE_MARKETS.map((m) => {
            const evt = SAMPLE_EVENTS.find((e) => e.id === m.eventId);
            const total = m.pool.hawk + m.pool.dove;
            const hawkPct = Math.round((m.pool.hawk / total) * 100);
            const result = duels[m.id];
            const staked = stakeTx[m.id];
            return (
              <motion.article
                key={m.id}
                initial={{ opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4 }}
                className="overflow-hidden rounded-2xl border border-border/60 bg-card/40 backdrop-blur"
              >
                <div className="grid gap-6 p-6 md:grid-cols-[1fr_auto] md:items-start">
                  <div>
                    <div className="flex items-center gap-2 font-mono text-xs text-muted-foreground">
                      <span className="text-primary">{m.id}</span>
                      <span>·</span>
                      <span>linked to {m.eventId}</span>
                      {m.status !== "open" && (
                        <Badge variant="secondary" className="ml-1 text-[10px]">{m.status}</Badge>
                      )}
                    </div>
                    <h3 className="mt-2 text-lg font-medium leading-snug">{m.question}</h3>
                    {evt && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        live severity <span className="font-mono text-foreground">{evt.severity}</span> · threshold <span className="font-mono text-foreground">{m.threshold}</span> · stage <span className="font-mono text-foreground">{evt.stage}</span>
                      </p>
                    )}
                  </div>
                  <Button
                    size="sm"
                    onClick={() => runDuel(m)}
                    disabled={duelLoading === m.id}
                    className="gap-2 self-start"
                  >
                    {duelLoading === m.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Swords className="h-4 w-4" />}
                    {duelLoading === m.id ? "Agents deliberating…" : "Run AI duel"}
                  </Button>
                </div>

                {/* Pool split */}
                <div className="px-6">
                  <div className="flex items-center justify-between font-mono text-xs text-muted-foreground">
                    <span className="text-destructive">HAWK ${m.pool.hawk.toLocaleString()} USDC</span>
                    <span className="text-primary">${m.pool.dove.toLocaleString()} USDC DOVE</span>
                  </div>
                  <div className="mt-1.5 flex h-1.5 overflow-hidden rounded-full bg-muted">
                    <div className="h-full bg-destructive" style={{ width: `${hawkPct}%` }} />
                    <div className="h-full bg-primary" style={{ width: `${100 - hawkPct}%` }} />
                  </div>
                </div>

                {/* Agent positions */}
                {result && (
                  <div className="mt-6 grid gap-px bg-border/60 md:grid-cols-2">
                    <AgentPosition side="HAWK" position={result.hawk} />
                    <AgentPosition side="DOVE" position={result.dove} />
                  </div>
                )}

                {/* Resolver */}
                {result && (
                  <div className="flex items-start gap-3 border-t border-border/60 bg-background/60 p-6">
                    <Gavel className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                    <div className="flex-1">
                      <div className="flex items-center gap-2 font-mono text-xs">
                        <span className="uppercase tracking-widest text-accent">Resolver Agent</span>
                        <Badge
                          variant={result.resolverVerdict.status === "resolved" ? "default" : "secondary"}
                          className="text-[10px]"
                        >
                          {result.resolverVerdict.status === "resolved"
                            ? `winner: ${result.resolverVerdict.winner}`
                            : "pending live feed"}
                        </Badge>
                      </div>
                      <p className="mt-1.5 text-sm text-muted-foreground">{result.resolverVerdict.reasoning}</p>
                    </div>
                  </div>
                )}

                {/* Main agent judgment */}
                {result && (
                  <div className="border-t border-border/60 bg-primary/5 p-6">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2 font-mono text-xs">
                        <Brain className="h-3.5 w-3.5 text-primary" />
                        <span className="uppercase tracking-widest text-primary">Main Agent Verdict</span>
                        {verdicts[m.id] && (
                          <Badge className="text-[10px]">
                            {verdicts[m.id].winner} · {verdicts[m.id].confidence}%
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 font-mono text-[11px] text-muted-foreground">
                        {verdicts[m.id] ? (
                          <Badge variant="secondary" className="gap-1 text-[10px]"><ShieldCheck className="h-3 w-3" /> auto-decided</Badge>
                        ) : judging === m.id ? (
                          <><Loader2 className="h-3.5 w-3.5 animate-spin text-primary" /> Main agent deciding…</>
                        ) : deadlines[m.id] ? (
                          <><Clock className="h-3.5 w-3.5 text-primary" /> auto-verdict in {formatCountdown(deadlines[m.id] - now)}</>
                        ) : null}
                      </div>
                    </div>
                    {!verdicts[m.id] && deadlines[m.id] && (
                      <div className="mt-3">
                        <div className="h-1 overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full bg-gradient-to-r from-primary to-accent transition-all"
                            style={{
                              width: `${Math.min(100, Math.max(0, 100 - ((deadlines[m.id] - now) / (24 * 60 * 60 * 1000)) * 100))}%`,
                            }}
                          />
                        </div>
                        <p className="mt-2 text-xs text-muted-foreground">
                          Prediction window runs 24h. Main agent will pull live Firecrawl news + hybrid-score against hawk/dove positions and historical calibration, then declare a winner automatically.
                        </p>
                      </div>
                    )}
                    {verdicts[m.id] && (
                      <div className="mt-3 space-y-2 text-sm">
                        <p className="text-foreground">{verdicts[m.id].reasoning}</p>
                        <p className="text-xs text-muted-foreground">📰 {verdicts[m.id].newsAlignment}</p>
                        <p className="text-xs text-muted-foreground">🎯 {verdicts[m.id].calibrationNote}</p>
                      </div>
                    )}
                  </div>
                )}

                {/* Stake actions */}
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/60 p-6">
                  <span className="font-mono text-[11px] text-muted-foreground">
                    gas + stake settled in USDC on Arc
                  </span>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => stakeOnArc(m, "HAWK")}
                      className="gap-1.5 border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                    >
                      Back HAWK
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => stakeOnArc(m, "DOVE")}
                      className="gap-1.5 border-primary/40 text-primary hover:bg-primary/10 hover:text-primary"
                    >
                      Back DOVE
                    </Button>
                  </div>
                </div>

                {staked && (
                  <div className="border-t border-primary/30 bg-primary/5 px-6 py-3 font-mono text-xs">
                    <span className="text-primary">✓ Staked on {staked.side}</span>{" "}
                    <a
                      href={`${activeNet.explorer}/tx/${staked.hash}`}
                      target="_blank"
                      rel="noreferrer"
                      className="break-all text-muted-foreground hover:text-foreground"
                    >
                      {staked.hash.slice(0, 18)}…
                    </a>
                  </div>
                )}
              </motion.article>
            );
          })}
        </div>

        {duelError && (
          <div className="mt-4 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
            {duelError}
          </div>
        )}
      </section>

      {/* Onchain panel */}
      <section id="onchain" className="mx-auto max-w-7xl px-6 py-24">
        <SectionHeader
          eyebrow="Onchain"
          title="Running on Arc. Mainnet flips on the day it does."
          desc="Arc is a stablecoin-first chain that settles in USDC. We pick up whichever network your wallet is on — testnet today, mainnet the moment it&apos;s live."
        />
        <div className="mt-12 grid gap-4 lg:grid-cols-[1fr_1.2fr]">
          <div className="space-y-4">
            {ARC_NETWORKS.map((n) => (
              <div
                key={n.key}
                className={`rounded-2xl border p-6 ${network?.key === n.key ? "border-primary/60 bg-primary/5" : "border-border/60 bg-card/40"}`}
              >
                <div className="flex items-center justify-between">
                  <h3 className="font-mono text-xs uppercase tracking-widest text-muted-foreground">{n.key}</h3>
                  <Badge variant={n.live ? "default" : "secondary"} className="text-[10px]">
                    {n.live ? "live" : "coming soon"}
                  </Badge>
                </div>
                <dl className="mt-4 space-y-2 text-sm">
                  <Row k="Network" v={n.chainName} />
                  <Row k="Chain ID" v={`${n.chainIdDec} (${n.chainIdHex})`} />
                  <Row k="Currency" v={n.currency.symbol} />
                  <Row k="Explorer" v={n.explorer} mono />
                </dl>
                {address && network?.key !== n.key && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void switchToArc(n)}
                    disabled={!n.live && n.key === "mainnet"}
                    className="mt-4 gap-1.5"
                  >
                    <Zap className="h-3.5 w-3.5" /> Switch to {n.chainName}
                  </Button>
                )}
                {n.faucet && (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Button size="sm" variant="ghost" asChild className="h-7 gap-1.5 px-2 text-xs">
                      <a href={n.faucet} target="_blank" rel="noreferrer">
                        <Zap className="h-3 w-3" /> Get test USDC
                      </a>
                    </Button>
                    <span className="font-mono text-[10px] text-muted-foreground">
                      USDC native · 18 decimals · sub-second finality
                    </span>
                  </div>
                )}
              </div>
            ))}
            {address && (
              <div className="rounded-2xl border border-border/60 bg-card/40 p-6">
                <div className="flex items-center gap-2 text-sm">
                  <ShieldCheck className="h-4 w-4 text-primary" />
                  Connected: <span className="font-mono">{shortAddr(address)}</span>
                </div>
                <div className="mt-2 flex items-center gap-2 text-sm">
                  <Activity className="h-4 w-4 text-primary" />
                  {onArc ? `On ${network?.chainName}` : "Not on an Arc network"}
                </div>
              </div>
            )}
          </div>
          <WalletTxFeed />
        </div>
      </section>

      {/* Roadmap */}
      <section id="roadmap" className="mx-auto max-w-7xl px-6 pb-32">
        <SectionHeader eyebrow="Roadmap" title="What we&apos;ve shipped, what&apos;s coming" />
        <div className="mt-12 grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          {[
            ["v0.1", "Classifier pipeline", "shipped"],
            ["v0.2", "Schema validation + E2E", "shipped"],
            ["v0.3", "Arc testnet publisher", "live"],
            ["v0.4", "Subscriber smart contract", "next"],
          ].map(([v, name, status]) => (
            <div key={v} className="rounded-xl border border-border/60 bg-card/40 p-5">
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs text-muted-foreground">{v}</span>
                <Badge variant={status === "next" ? "secondary" : "default"} className="text-[10px]">
                  {status}
                </Badge>
              </div>
              <div className="mt-3 text-sm font-medium">{name}</div>
            </div>
          ))}
        </div>
      </section>

      <footer className="border-t border-border/60">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 px-6 py-8 text-xs text-muted-foreground md:flex-row">
          <span className="font-mono">© 2026 Geomacro · schema: geomacro.event.v1</span>
          <span className="font-mono">{activeNet.chainName} · Chain {activeNet.chainIdDec}</span>
        </div>
      </footer>
    </div>
  );
}

function Stat({ label, value, suffix, accent }: { label: string; value: number; suffix?: string; accent?: boolean }) {
  return (
    <div>
      <dt className="font-mono text-xs uppercase tracking-widest text-muted-foreground">{label}</dt>
      <dd className={`mt-2 font-mono text-3xl tabular-nums ${accent ? "text-primary" : ""}`}>
        {value}{suffix && <span className="text-base text-muted-foreground">{suffix}</span>}
      </dd>
    </div>
  );
}

function SectionHeader({ eyebrow, title, desc }: { eyebrow: string; title: string; desc?: string }) {
  return (
    <div className="max-w-2xl">
      <div className="font-mono text-xs uppercase tracking-widest text-primary">{eyebrow}</div>
      <h2 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">{title}</h2>
      {desc && <p className="mt-3 text-muted-foreground">{desc}</p>}
    </div>
  );
}

function StageBadge({ stage }: { stage: string }) {
  const tone =
    stage === "Active Escalation" ? "bg-destructive/15 text-destructive border-destructive/30" :
    stage === "Building" ? "bg-accent/15 text-accent border-accent/30" :
    stage === "Fragile Ceasefire" ? "bg-primary/15 text-primary border-primary/30" :
    "bg-muted text-muted-foreground border-border";
  return (
    <span className={`shrink-0 rounded-full border px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider ${tone}`}>
      {stage}
    </span>
  );
}

function Meter({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="font-mono text-xs text-muted-foreground">{label}</span>
        <span className="font-mono text-xs tabular-nums">{value}</span>
      </div>
      <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-muted">
        <div className="h-full bg-gradient-to-r from-primary to-accent" style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

function Row({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-border/40 pb-2 last:border-0">
      <dt className="text-muted-foreground">{k}</dt>
      <dd className={mono ? "font-mono text-xs break-all text-right" : "text-right"}>{v}</dd>
    </div>
  );
}

function AgentPosition({
  side,
  position,
}: {
  side: AgentSide;
  position: { side: "YES" | "NO"; confidence: number; stakeUsdc: number; rationale: string };
}) {
  const isHawk = side === "HAWK";
  const accent = isHawk ? "text-destructive" : "text-primary";
  const dot = isHawk ? "bg-destructive" : "bg-primary";
  return (
    <div className="bg-background p-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
          <span className={`font-mono text-xs uppercase tracking-widest ${accent}`}>
            {AGENTS[side].name}
          </span>
        </div>
        <Badge variant="outline" className="font-mono text-[10px]">
          {position.side} · {position.confidence}%
        </Badge>
      </div>
      <div className={`mt-3 font-mono text-2xl tabular-nums ${accent}`}>
        ${position.stakeUsdc.toLocaleString()}
        <span className="ml-1 text-xs text-muted-foreground">USDC</span>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{position.rationale}</p>
    </div>
  );
}
