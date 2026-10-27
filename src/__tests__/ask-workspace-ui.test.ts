import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workspace = readFileSync("src/components/ask/ask-workspace.tsx", "utf8");
const answers = readFileSync("src/components/ask/ask-answer-view.tsx", "utf8");
const legacy = readFileSync("src/lib/ask-legacy-transport.ts", "utf8");
const transport = readFileSync("server/api/public-ask.get.ts", "utf8");
const adapter = readFileSync("src/lib/hybrid-agent-chat.server.ts", "utf8");

describe("Ask Geomacro conversational workspace", () => {
  it("offers a ChatGPT-style, accessible multi-chat layout without saving user text", () => {
    for (const marker of [
      'aria-label="Conversation history"',
      'aria-label="Chat messages"',
      'aria-label="Open conversation menu"',
      'aria-label="New chat"',
      "Recent chats",
      "Message Ask Geomacro",
      "aria-label=\"Copy Geomacro answer\"",
      "Shift+Enter for a new line",
      "Chats stay in this tab only",
    ]) {
      expect(workspace).toContain(marker);
    }
    expect(workspace).not.toMatch(/localStorage|sessionStorage|indexedDB/);
  });

  it("keeps chat sessions separate and sends only the active chat's last question as context", () => {
    expect(workspace).toContain("const previousQuestion = active.turns.at(-1)?.resolvedQuestion;");
    expect(workspace).toContain("requestPublicAsk(question, previousQuestion, controller.signal)");
    expect(workspace).toContain("session.id === chatId");
    expect(workspace).toContain("const MAX_VISIBLE_TURNS = 12;");
    expect(workspace).toContain("const MAX_SESSIONS = 10;");
    expect(workspace).toContain("PUBLIC_ASK_REQUEST_TIMEOUT_MS");
    expect(workspace).toContain("onRetry={() => void ask(currentFailure.question)}");
    expect(adapter).toContain("executeAskGeomacro");
  });

  it("retains the public research boundary with no payment or direct signing", () => {
    expect(legacy).toContain('fetch("/api/public-ask"');
    expect(legacy).toContain('cache: "no-store"');
    expect(transport).toContain("executeHybridChatTurn");
    expect(workspace).not.toMatch(/settleCoinbaseX402|signRiskObject|GROQ_API_KEY|OPENAI_API_KEY/);
    expect(answers).toContain("answer.insufficient_evidence");
    expect(answers).toContain("answer.what_changed");
    expect(answers).toContain("answer.why_it_matters");
    expect(answers).toContain("answer.geomacro_view");
  });
});
