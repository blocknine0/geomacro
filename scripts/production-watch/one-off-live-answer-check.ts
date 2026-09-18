import { answerQuestion } from "./src/lib/ask-intelligence.server.ts";

const cases = [
  { category: "geopolitics", mode: "current", question: "What is the current geopolitical risk around sanctions, conflict escalation and trade restrictions?" },
  { category: "macro", mode: "current", question: "What is the current macroeconomic risk around inflation, rates, growth and currency pressure?" },
  { category: "critical_minerals", mode: "current", question: "What is the current risk around rare earth supply, export controls and permanent magnet supply chains?" },
  { category: "geopolitics", mode: "historical", asOf: "2026-08-01T12:00:00Z", question: "As of August 1 2026, what did Geomacro stored intelligence show about geopolitical risk, sanctions and conflict escalation?" },
  { category: "macro", mode: "historical", asOf: "2026-07-15T12:00:00Z", question: "As of July 15 2026, what did Geomacro stored intelligence show about inflation, rates and economic growth risk?" },
  { category: "critical_minerals", mode: "historical", asOf: "2026-06-15T12:00:00Z", question: "As of June 15 2026, what did Geomacro stored intelligence show about rare earth supply, export controls and mineral processing risk?" },
];

for (const item of cases) {
  const started = Date.now();
  try {
    const answer = await answerQuestion(item.question, item.mode === "historical" ? { asOf: item.asOf } : {});
    console.log(JSON.stringify({ ...item, latency_ms: Date.now() - started, answer }, null, 2));
  } catch (error) {
    console.log(JSON.stringify({ ...item, latency_ms: Date.now() - started, error: error instanceof Error ? error.message : String(error) }, null, 2));
  }
}