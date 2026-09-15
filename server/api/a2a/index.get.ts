import {
  defineEventHandler,
  getRequestURL,
  setResponseHeaders,
} from "h3";

import {
  GEOMACRO_A2A_PROTOCOL_VERSION,
  geomacroA2AAgentCard,
} from "../../../src/lib/a2a-contract";

export default defineEventHandler((event) => {
  setResponseHeaders(event, {
    "Access-Control-Allow-Origin": "*",
    "A2A-Version": GEOMACRO_A2A_PROTOCOL_VERSION,
    "Cache-Control": "public, max-age=60",
    "Content-Type": "application/a2a+json; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
  });
  const origin = getRequestURL(event).origin;
  return {
    ok: true,
    protocol: "A2A",
    protocolVersion: GEOMACRO_A2A_PROTOCOL_VERSION,
    agentCard: geomacroA2AAgentCard(origin),
    execution_authorized: false,
  };
});
