import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workspace = readFileSync("src/components/ask/ask-workspace.tsx", "utf8");
const core = readFileSync("src/lib/ask-geomacro-core.server.ts", "utf8");
const brief = readFileSync("src/lib/ask-commercial-brief.ts", "utf8");

describe("Ask Geomacro direct chat surface", () => {
  it("keeps a conversational multi-turn UI instead of a fixed report layout", () => {
    expect(workspace).toContain("type ChatTurn");
    expect(workspace).toContain("setTurns");
    expect(workspace).toContain("UserBubble");
    expect(workspace).toContain("AssistantAnswer");
    expect(workspace).toContain("Ask Geomacro…");
    expect(workspace).toContain("Direct answers only · Shift+Enter for a new line");
    expect(workspace).not.toContain('label="What changed"');
    expect(workspace).not.toContain('label="Why it matters"');
    expect(workspace).not.toContain('label="Geomacro view · interpretation"');
  });

  it("renders only the question-specific direct summary as the main assistant answer", () => {
    expect(workspace).toContain("{answer.summary}");
    expect(workspace).not.toContain("{answer.what_changed}");
    expect(workspace).not.toContain("{answer.why_it_matters}");
    expect(workspace).not.toContain("{answer.geomacro_view}");
    expect(brief).toContain("directAnswerForQuestion");
    expect(core).toContain('from "./ask-answer.server"');
    expect(core).toContain("toCommercialAskBrief(await answerAskQuestion(data.question), data.question)");
  });

  it("keeps evidence compact and preserves the public data boundary", () => {
    expect(workspace).toContain("<details");
    expect(workspace).toContain("Evidence ({evidence.length})");
    expect(workspace).toContain('!eventId.startsWith("live:")');
    expect(workspace).toContain('!eventId.startsWith("web:")');
    expect(workspace).toContain("Answers focus on useful risk context and clearly distinguish what is known from what is uncertain.");
  });
});
