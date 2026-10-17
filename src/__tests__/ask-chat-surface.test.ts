import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workspace = readFileSync("src/components/ask/ask-workspace.tsx", "utf8");
const core = readFileSync("src/lib/ask-geomacro-core.server.ts", "utf8");
const brief = readFileSync("src/lib/ask-commercial-brief.ts", "utf8");

describe("Ask Geomacro direct chat surface", () => {
  it("keeps a conversational multi-turn UI instead of a fixed report layout", () => {
    expect(workspace).toContain("type ChatTurn");
    expect(workspace).toContain("setSessions");
    expect(workspace).toContain("session.id === chatId");
    expect(workspace).toContain('"X-Geomacro-Previous-Question"');
    expect(workspace).toContain("resolvedQuestion");
    expect(workspace).toContain("New chat");
    expect(workspace).toContain("UserBubble");
    expect(workspace).toContain("AssistantAnswer");
    expect(workspace).toContain("Message Ask Geomacro…");
    expect(workspace).toContain("Enter to send · Shift+Enter for a new line");
    expect(workspace).not.toContain('label="What changed"');
    expect(workspace).not.toContain('label="Why it matters"');
    expect(workspace).not.toContain('label="Geomacro view · interpretation"');
  });

  it("shows the direct answer first with explainable context underneath", () => {
    expect(workspace).toContain("{answer.summary}");
    expect(workspace).toContain("{answer.what_changed}");
    expect(workspace).toContain("{answer.why_it_matters}");
    expect(workspace).toContain("{answer.geomacro_view}");
    expect(brief).toContain("directAnswerForQuestion");
    expect(core).toContain('from "./ask-answer.server"');
    expect(core).toContain("toCommercialAskBrief(await answerAskQuestion(data.question), data.question)");
  });

  it("keeps evidence compact and preserves the public data boundary", () => {
    expect(workspace).toContain("<details");
    expect(workspace).toContain("Evidence ({evidence.length})");
    expect(workspace).toContain('!eventId.startsWith("live:")');
    expect(workspace).toContain('!eventId.startsWith("web:")');
    expect(workspace).toContain("Follow-ups use bounded context, not previous answers as evidence.");
    expect(workspace).toContain("Geomacro will not fill an evidence gap with a synthetic claim.");
  });
});
