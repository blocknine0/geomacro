import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { useServerFn } from "@tanstack/react-start";
import {
  ALLOWED_TOPICS,
  runAutonomousCycle,
  type CyclePayload,
} from "@/lib/autonomous-agent.functions";
import {
  compactPastForPrompt,
  encodeAttestationCalldata,
  loadAttestations,
  saveAttestation,
  sha256Hex,
  type Attestation,
} from "@/lib/attestation";
import { useWallet } from "@/hooks/wallet-provider";
import { preferredNetwork } from "@/lib/arc";
import { rememberSessionTx } from "@/lib/wallet-tx";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Bot,
  Brain,
  CheckCircle2,
  Loader2,
  Newspaper,
  Radio,
  Search,
  Signature,
  Sparkles,
} from "lucide-react";

type Stage = "idle" | "search" | "reflect" | "predict" | "attest" | "done" | "error";

const STAGES: { key: Exclude<Stage, "idle" | "done" | "error">; label: string; icon: typeof Search }[] = [
  { key: "search", label: "Search live news", icon: Newspaper },
  { key: "reflect", label: "Reflect on past attestations", icon: Brain },
  { key: "predict", label: "Predict narrative", icon: Sparkles },
  { key: "attest", label: "Sign attestation on Arc", icon: Signature },
];

export function AutonomousOracle() {
  const { address, onArc, network, connect, switchToArc } = useWallet();
  const activeNet = network ?? preferredNetwork();
  const cycle = useServerFn(runAutonomousCycle);

  const [topic, setTopic] = useState<(typeof ALLOWED_TOPICS)[number]>(ALLOWED_TOPICS[0]);
  const [stage, setStage] = useState<Stage>("idle");
  const [current, setCurrent] = useState<CyclePayload | null>(null);
  const [history, setHistory] = useState<Attestation[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const lastRunRef = useRef<number>(0);

  useEffect(() => {
    setHistory(loadAttestations(address));
  }, [address]);

  const accuracy = useMemo(() => {
    if (history.length < 2) return null;
    // Simple heuristic: % of consecutive cycles where the prediction side
    // matched the next cycle's event stage tendency.
    let hits = 0;
    let total = 0;
    for (let i = 0; i < history.length - 1; i++) {
      const prev = history[i + 1].payload.prediction.side;
      const nextStage = history[i].payload.event.stage;
      const escalated = nextStage === "Active Escalation" || nextStage === "Building";
      const deescalated = nextStage === "De-escalation" || nextStage === "Fragile Ceasefire";
      const stable = nextStage === "Stable" || nextStage === "Monitoring";
      if (
        (prev === "ESCALATE" && escalated) ||
        (prev === "DEESCALATE" && deescalated) ||
        (prev === "STABLE" && stable)
      ) {
        hits++;
      }
      total++;
    }
    return total ? Math.round((hits / total) * 100) : null;
  }, [history]);

  const runCycle = useCallback(async () => {
    if (Date.now() - lastRunRef.current < 5 * 60_000 && stage !== "idle") return;
    lastRunRef.current = Date.now();
    setErr(null);
    setCurrent(null);
    setStage("search");

    try {
      // The server fn does search+reflect+predict in one call. We animate the
      // stages client-side so the user can see the pipeline progressing.
      const past = loadAttestations(address);
      setTimeout(() => setStage((s) => (s === "search" ? "reflect" : s)), 900);
      setTimeout(() => setStage((s) => (s === "reflect" ? "predict" : s)), 1900);

      const payload = await cycle({
        data: {
          topic,
          pastAttestations: compactPastForPrompt(past),
        },
      });
      setCurrent(payload);

      if (!address) {
        setStage("done");
        return;
      }
      if (!onArc) {
        await switchToArc();
      }
      setStage("attest");

      const canonical = JSON.stringify({
        cycleId: payload.cycleId,
        topic: payload.topic,
        generatedAt: payload.generatedAt,
        event: payload.event,
        prediction: payload.prediction,
      });
      const digest = await sha256Hex(canonical);
      const eth = window.ethereum;
      if (!eth) throw new Error("No wallet");
      const hash = (await eth.request({
        method: "eth_sendTransaction",
        params: [
          {
            from: address,
            to: address,
            value: "0x0",
            data: encodeAttestationCalldata(digest, payload.cycleId),
          },
        ],
      })) as string;

      const att: Attestation = {
        cycleId: payload.cycleId,
        digest,
        txHash: hash,
        payload,
        attestedAt: new Date().toISOString(),
      };
      saveAttestation(address, att);
      rememberSessionTx(activeNet, address, {
        hash,
        from: address,
        to: address,
        valueWei: "0",
        timestamp: Math.floor(Date.now() / 1000),
        blockNumber: null,
        input: encodeAttestationCalldata(digest, payload.cycleId),
      });
      setHistory(loadAttestations(address));
      setStage("done");
    } catch (e) {
      console.warn("[autonomous-cycle]", e);
      setErr(
        e instanceof Error && /forbidden|too many/i.test(e.message)
          ? e.message
          : "Cycle failed. The agent will retry on the next run.",
      );
      setStage("error");
    }
  }, [address, cycle, onArc, stage, switchToArc, topic]);

  // Auto-run once per session when wallet connects.
  const autoRanRef = useRef(false);
  useEffect(() => {
    if (autoRanRef.current) return;
    if (!address) return;
    autoRanRef.current = true;
    void runCycle();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address]);

  return (
    <section id="oracle" className="border-y border-border/60 bg-card/20">
      <div className="mx-auto max-w-7xl px-6 py-24">
        <div className="flex items-end justify-between gap-6">
          <div>
            <div className="font-mono text-xs uppercase tracking-widest text-primary">The main agent</div>
            <h2 className="mt-2 text-balance text-3xl font-semibold tracking-tight md:text-4xl">
              It reads, makes a call, and puts its name to it.
            </h2>
            <p className="mt-3 max-w-2xl text-muted-foreground">
              Each cycle it pulls the latest news, picks a narrative, looks back at how
              its own past calls played out on Arc, then signs a fresh prediction. The
              chain is the memory — every call we&apos;ve ever made is right there.
            </p>
          </div>
          {accuracy !== null && (
            <Badge variant="outline" className="hidden border-primary/40 bg-primary/5 px-3 py-1.5 font-mono text-xs text-primary md:inline-flex">
              calibration {accuracy}%
            </Badge>
          )}
        </div>

        <div className="mt-10 grid gap-6 lg:grid-cols-[1fr_360px]">
          {/* Control + cycle */}
          <div className="rounded-2xl border border-border/60 bg-card/40 p-6 backdrop-blur">
            <div className="flex flex-wrap items-center gap-3">
              <label className="font-mono text-xs text-muted-foreground">narrative</label>
              <select
                value={topic}
                onChange={(e) => setTopic(e.target.value as typeof topic)}
                disabled={stage !== "idle" && stage !== "done" && stage !== "error"}
                className="rounded-md border border-border/60 bg-background px-3 py-1.5 font-mono text-sm focus:border-primary focus:outline-none"
              >
                {ALLOWED_TOPICS.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
              <Button
                onClick={() => {
                  if (!address) { void connect(); return; }
                  void runCycle();
                }}
                disabled={stage === "search" || stage === "reflect" || stage === "predict" || stage === "attest"}
                className="gap-2"
              >
                {stage === "idle" || stage === "done" || stage === "error" ? (
                  <><Radio className="h-4 w-4" /> {address ? "Run cycle" : "Connect & run"}</>
                ) : (
                  <><Loader2 className="h-4 w-4 animate-spin" /> Running…</>
                )}
              </Button>
            </div>

            {/* Stage pills */}
            <ol className="mt-6 grid gap-2 md:grid-cols-4">
              {STAGES.map((s) => {
                const order: Stage[] = ["search", "reflect", "predict", "attest"];
                const idx = order.indexOf(s.key);
                const curIdx = order.indexOf(stage as Stage);
                const active = stage === s.key;
                const done = curIdx > idx || stage === "done";
                const Icon = s.icon;
                return (
                  <li
                    key={s.key}
                    className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs ${
                      active
                        ? "border-primary/60 bg-primary/10 text-primary"
                        : done
                        ? "border-border/60 bg-card/40 text-foreground"
                        : "border-border/40 bg-background text-muted-foreground"
                    }`}
                  >
                    {active ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : done ? (
                      <CheckCircle2 className="h-3.5 w-3.5" />
                    ) : (
                      <Icon className="h-3.5 w-3.5" />
                    )}
                    {s.label}
                  </li>
                );
              })}
            </ol>

            {err && (
              <div className="mt-4 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
                {err}
              </div>
            )}

            {/* Result */}
            {current && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-6 space-y-5 border-t border-border/60 pt-6"
              >
                <div>
                  <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                    event · {current.event.schemaVersion}
                  </div>
                  <div className="mt-1 text-lg font-medium">{current.event.narrative}</div>
                  <div className="mt-2 flex flex-wrap gap-2 font-mono text-xs">
                    <Badge variant="secondary">{current.event.stage}</Badge>
                    <Badge variant="outline">severity {current.event.severity}</Badge>
                    <Badge variant="outline">conf {current.event.confidence}</Badge>
                    <Badge variant="outline" className={current.event.delta >= 0 ? "text-accent" : "text-primary"}>
                      Δ {current.event.delta >= 0 ? "+" : ""}{current.event.delta}
                    </Badge>
                  </div>
                </div>

                <div className="rounded-xl border border-primary/30 bg-primary/5 p-4">
                  <div className="font-mono text-[10px] uppercase tracking-widest text-primary">prediction · {current.prediction.horizonHours}h horizon</div>
                  <div className="mt-1 font-medium">{current.prediction.statement}</div>
                  <div className="mt-2 text-sm text-muted-foreground">{current.prediction.rationale}</div>
                  <div className="mt-3 flex flex-wrap gap-2 font-mono text-xs">
                    <Badge>{current.prediction.side}</Badge>
                    <Badge variant="outline">conf {current.prediction.confidence}</Badge>
                    <Badge variant="outline">expected: {current.prediction.expectedOutcome}</Badge>
                  </div>
                </div>

                <div className="rounded-xl border border-border/60 bg-background/40 p-4">
                  <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                    <Brain className="h-3 w-3" /> self-reflection · past accuracy {current.reflection.pastAccuracySelfAssessment}%
                  </div>
                  <ul className="mt-2 space-y-1 text-sm">
                    {current.reflection.lessonsApplied.map((l, i) => (
                      <li key={i} className="flex gap-2"><span className="text-primary">›</span>{l}</li>
                    ))}
                  </ul>
                  <div className="mt-2 text-xs text-muted-foreground">{current.reflection.calibrationAdjustment}</div>
                </div>

                <details className="rounded-lg border border-border/40 bg-background/40 p-3 text-xs">
                  <summary className="cursor-pointer font-mono text-muted-foreground">sources ({current.hits.length})</summary>
                  <ul className="mt-2 space-y-1">
                    {current.hits.map((h) => (
                      <li key={h.url}>
                        <a href={h.url} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                          {h.title}
                        </a>
                      </li>
                    ))}
                  </ul>
                </details>
              </motion.div>
            )}
          </div>

          {/* Onchain memory timeline */}
          <aside className="rounded-2xl border border-border/60 bg-card/40 p-6 backdrop-blur">
            <div className="flex items-center gap-2">
              <Bot className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-medium">Onchain memory</h3>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {address
                ? `${history.length} attestation${history.length === 1 ? "" : "s"} on Arc · used as training signal`
                : "Connect a wallet to start writing the agent's memory onchain."}
            </p>
            <ol className="mt-4 space-y-3">
              {history.slice(0, 8).map((a) => (
                <li key={a.txHash} className="rounded-lg border border-border/40 bg-background/40 p-3">
                  <div className="flex items-center justify-between font-mono text-[10px] text-muted-foreground">
                    <span>{a.cycleId}</span>
                    <a
                      href={`${activeNet.explorer}/tx/${a.txHash}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-primary hover:underline"
                    >
                      verify ↗
                    </a>
                  </div>
                  <div className="mt-1 line-clamp-2 text-xs">{a.payload.prediction.statement}</div>
                  <div className="mt-1 flex gap-2 font-mono text-[10px] text-muted-foreground">
                    <span>{a.payload.prediction.side}</span>
                    <span>·</span>
                    <span>conf {a.payload.prediction.confidence}</span>
                    <span>·</span>
                    <span>{new Date(a.attestedAt).toUTCString().slice(5, 22)}</span>
                  </div>
                </li>
              ))}
              {history.length === 0 && (
                <li className="rounded-lg border border-dashed border-border/40 p-4 text-center text-xs text-muted-foreground">
                  No attestations yet. Run a cycle.
                </li>
              )}
            </ol>
          </aside>
        </div>
      </div>
    </section>
  );
}