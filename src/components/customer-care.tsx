import { useMemo, useState } from "react";
import { Mail, MessageCircle, Send, X } from "lucide-react";

const EMAIL = "contact@geomacro.live";

const QUICK_QUESTIONS = [
  "What is Geomacro?",
  "What is live at launch?",
  "What is on the roadmap?",
  "What is Critical Minerals Risk?",
] as const;

function answerQuestion(input: string): string {
  const q = input.trim().toLowerCase();
  if (!q) return "Ask me about Geomacro, launch products, Critical Minerals & Rare Earth Risk, roadmap, pricing or support.";

  if (q.includes("what is geomacro") || q.includes("geomacro ki")) {
    return "Geomacro is an evidence-driven geopolitical, macroeconomic and critical-minerals risk intelligence product. It helps users see what changed, why it matters, supporting evidence, confidence and risk context.";
  }
  if (q.includes("live") || q.includes("launch") || q.includes("user") || q.includes("people") || q.includes("human")) {
    return "At launch, users get Geomacro Intelligence, separate Risk Indices, Critical Minerals & Rare Earth Risk, Ask Geomacro, and supporting research/evidence surfaces. Only launch-ready capabilities are presented as live products.";
  }
  if (q.includes("roadmap") || q.includes("machine") || q.includes("agent") || q.includes("api") || q.includes("risk gate") || q.includes("x402")) {
    return "Governed machine/API delivery, signed Risk Objects, Risk Gate, paid agent/x402 production access and additional automation are roadmap or controlled capabilities, not part of the initial launch promise. Check the Roadmap page for current status.";
  }
  if (q.includes("rare") || q.includes("mineral") || q.includes("earth")) {
    return "Critical Minerals & Rare Earth Risk is a dedicated Geomacro launch product for supply concentration, geopolitical dependency, sourcing pressure and related macro exposure, with evidence and confidence boundaries.";
  }
  if (q.includes("price") || q.includes("pricing") || q.includes("cost") || q.includes("plan")) {
    return `For pricing, commercial access or a proposal, contact ${EMAIL}.`;
  }
  if (q.includes("support") || q.includes("contact") || q.includes("help") || q.includes("issue") || q.includes("problem")) {
    return `I can answer common product questions here. For commercial, account, partnership or unresolved technical support, email ${EMAIL}.`;
  }
  if (q.includes("intelligence")) {
    return "Geomacro Intelligence presents current geopolitical, macroeconomic and critical-minerals developments as structured, explainable risk context with supporting evidence and explicit confidence boundaries.";
  }

  return `I can help with general Geomacro product questions. For a detailed answer, commercial discussion or technical case, please contact ${EMAIL}.`;
}

export function CustomerCare() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [question, setQuestion] = useState("What is Geomacro?");
  const answer = useMemo(() => answerQuestion(question), [question]);

  const submit = (value?: string) => {
    const next = (value ?? input).trim();
    if (!next) return;
    setQuestion(next);
    setInput("");
  };

  return (
    <div className="fixed bottom-4 right-4 z-[70] sm:bottom-6 sm:right-6">
      {open ? (
        <div className="mb-3 w-[calc(100vw-2rem)] max-w-sm overflow-hidden rounded-2xl border border-border/70 bg-background/95 shadow-2xl backdrop-blur-xl">
          <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
            <div>
              <p className="text-sm font-semibold">Geomacro Customer Care</p>
              <p className="text-[11px] text-muted-foreground">Product help and general questions</p>
            </div>
            <button onClick={() => setOpen(false)} aria-label="Close customer care" className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground"><X className="h-4 w-4" /></button>
          </div>

          <div className="max-h-[60vh] space-y-4 overflow-y-auto p-4">
            <div className="rounded-xl border border-border/60 bg-card/40 p-3 text-sm leading-6">
              <p className="font-medium">{question}</p>
              <p className="mt-2 text-muted-foreground">{answer}</p>
            </div>

            <div className="flex flex-wrap gap-2">
              {QUICK_QUESTIONS.map((item) => (
                <button key={item} onClick={() => submit(item)} className="rounded-full border border-border/70 px-3 py-1.5 text-xs text-muted-foreground transition hover:border-primary/40 hover:text-foreground">{item}</button>
              ))}
            </div>

            <div className="flex gap-2">
              <input
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => { if (event.key === "Enter") submit(); }}
                placeholder="Ask about Geomacro..."
                className="min-w-0 flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary/60"
                aria-label="Ask Geomacro Customer Care"
              />
              <button onClick={() => submit()} aria-label="Send question" className="inline-flex h-10 w-10 items-center justify-center rounded-md bg-primary text-primary-foreground"><Send className="h-4 w-4" /></button>
            </div>

            <div className="border-t border-border/60 pt-3 text-xs leading-5 text-muted-foreground">
              Need pricing, partnership, commercial or deeper technical help?
              <a href={`mailto:${EMAIL}`} className="mt-2 flex items-center gap-2 font-medium text-primary hover:underline"><Mail className="h-3.5 w-3.5" /> {EMAIL}</a>
            </div>
          </div>
        </div>
      ) : null}

      <button
        onClick={() => setOpen((value) => !value)}
        className="ml-auto flex items-center gap-2 rounded-full border border-primary/30 bg-primary px-4 py-3 text-sm font-medium text-primary-foreground shadow-lg transition hover:bg-primary/90"
        aria-label="Open Geomacro Customer Care"
      >
        <MessageCircle className="h-4 w-4" />
        <span>Customer Care</span>
      </button>
    </div>
  );
}
