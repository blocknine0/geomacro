import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const inbound = readFileSync("src/lib/a2a-inbound-integrity.server.ts", "utf8");
const route = readFileSync("server/api/a2a/[...path].ts", "utf8");
const peer = readFileSync("src/lib/a2a-trusted-peer.server.ts", "utf8");
const outbound = readFileSync("server/api/a2a/outbound.post.ts", "utf8");
const poll = readFileSync("server/api/a2a/outbound/[taskId].get.ts", "utf8");

describe("A2A v1 hardening", () => {
  it("fails closed when a principal reuses a messageId with a different payload", () => {
    expect(inbound).toContain("A2A_MESSAGE_ID_CONFLICT");
    expect(inbound).toContain("canonicalComparableMessage");
    expect(inbound).toContain('select("task_id,payload")');
    expect(route).toContain("assertA2AMessageIdempotency");
  });

  it("returns the bounded most-recent history in chronological order", () => {
    expect(inbound).toContain('.order("created_at", { ascending: false })');
    expect(inbound).toContain(".reverse()");
    expect(route).toContain("loadLatestA2AMessageHistory");
  });

  it("requires explicit trusted-peer capability negotiation before outbound send", () => {
    expect(peer).toContain("required_skill_id");
    expect(peer).toContain("A2A_PEER_SKILL_UNAVAILABLE");
    expect(peer).toContain("card.skills.some");
    expect(peer).toContain('entry.protocolBinding.toUpperCase() === "HTTP+JSON"');
    expect(outbound).toContain("assertA2AOutboundCapabilityNegotiation");
    expect(outbound).toContain("skillId: negotiation.required_skill_id");
  });

  it("maintains remote task lifecycle through trusted polling without arbitrary URLs", () => {
    expect(peer).toContain("pollTrustedA2ATask");
    expect(peer).toContain("trusted_peer_task_polled");
    expect(peer).toContain("A2A_REMOTE_TASK_ID_CONFLICT");
    expect(poll).toContain("pollTrustedA2ATask");
    expect(poll).not.toContain("target_url");
  });

  it("keeps the permanent no-execution boundary", () => {
    expect(peer).toContain("execution_authorized: false");
    expect(poll).toContain("execution_authorized: false");
  });
});
