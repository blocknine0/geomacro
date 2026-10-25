import {describe, expect, it, vi} from "vitest";
import {geomacroAgentToolToCanonicalQuery} from "./geomacro-agent-tools";
import {callCanonicalWithSourceResearchFallback} from "./answer-question-source-fallback.server";

function request(headers: Record<string, string> = {}) {
  return new Request("https://geomacro.live/api/v1/agent", {
    method: "POST",
    headers: {"content-type": "application/json", ...headers},
    body: JSON.stringify({tool: "answer_question", arguments: {question: "Latest inflation risk in Brazil"}}),
  });
}

function unavailable() {
  return Response.json({
    ok: false,
    chargeable: false,
    payment_required_now: false,
    error: {code: "INSUFFICIENT_COVERAGE"},
    execution_authorized: false,
  }, {status: 422});
}

function researchPending() {
  return Response.json({
    ok: false,
    chargeable: false,
    payment_required_now: false,
    research_answer: {
      schema: "geomacro.source-grounded-research-answer.v1",
      status: "UNVERIFIED_RESEARCH_ONLY",
      query_plan_hash: "a".repeat(64),
      commercial_delivery: {
        chargeable: false,
        payment_required_now: false,
        commercial_rights_verified: false,
        independent_same_event_corroboration_verified: false,
        signed: false,
        raw_upstream_delivered: false,
        source_identity_exposed: false,
        execution_authorized: false,
      },
    },
    error: {code: "ON_DEMAND_VERIFICATION_PENDING"},
    execution_authorized: false,
  }, {status: 422});
}

describe("Answer Question source research fallback", () => {
  it("tries the paid canonical product first, then bounded live research only after a no-charge refusal", async () => {
    const query = geomacroAgentToolToCanonicalQuery("answer_question", {
      question: "Latest inflation risk in Brazil",
    });
    const canonicalPost = vi.fn()
      .mockResolvedValueOnce(unavailable())
      .mockResolvedValueOnce(researchPending());
    const outerRequest = request();

    const response = await callCanonicalWithSourceResearchFallback({
      request: outerRequest,
      toolName: "answer_question",
      query,
      canonicalPost,
    });

    expect(response.status).toBe(422);
    expect(canonicalPost).toHaveBeenCalledTimes(2);
    const firstRequest = canonicalPost.mock.calls[0]?.[0].request as Request;
    const secondRequest = canonicalPost.mock.calls[1]?.[0].request as Request;
    expect((await firstRequest.clone().json()).fulfillment_mode).toBe("published_only");
    expect((await secondRequest.clone().json()).fulfillment_mode).toBe("live_on_demand");
    expect(secondRequest.headers.has("payment-signature")).toBe(false);
  });

  it("does not run the fallback when a quote exists or the caller supplied a payment", async () => {
    const query = geomacroAgentToolToCanonicalQuery("answer_question", {
      question: "Latest inflation risk in Brazil",
    });
    const quote = Response.json({x402Version: 2, accepts: []}, {status: 402});
    const canonicalPost = vi.fn().mockResolvedValue(quote);
    const response = await callCanonicalWithSourceResearchFallback({
      request: request(),
      toolName: "answer_question",
      query,
      canonicalPost,
    });
    expect(response.status).toBe(402);
    expect(canonicalPost).toHaveBeenCalledTimes(1);

    const paymentPost = vi.fn().mockResolvedValue(unavailable());
    const paymentResponse = await callCanonicalWithSourceResearchFallback({
      request: request({"payment-signature": "signed-payment-payload"}),
      toolName: "answer_question",
      query,
      canonicalPost: paymentPost,
    });
    expect(paymentResponse.status).toBe(422);
    expect(paymentPost).toHaveBeenCalledTimes(1);
  });

  it("does not run live research for multi-country or non-Answer Question tools", async () => {
    const oneCountry = geomacroAgentToolToCanonicalQuery("answer_question", {
      question: "Latest inflation risk in Brazil",
    });
    const multiCountry = {
      ...oneCountry,
      subjects: [
        {type: "country" as const, country_iso3: "BRA"},
        {type: "country" as const, country_iso3: "ARG"},
      ],
    };
    const canonicalPost = vi.fn().mockResolvedValue(unavailable());
    await callCanonicalWithSourceResearchFallback({
      request: request(), toolName: "answer_question",
      query: multiCountry, canonicalPost,
    });
    expect(canonicalPost).toHaveBeenCalledTimes(1);

    const otherToolPost = vi.fn().mockResolvedValue(unavailable());
    await callCanonicalWithSourceResearchFallback({
      request: request(), toolName: "critical_minerals_query",
      query: oneCountry, canonicalPost: otherToolPost,
    });
    expect(otherToolPost).toHaveBeenCalledTimes(1);
  });
});
