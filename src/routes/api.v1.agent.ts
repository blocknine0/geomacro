import {createFileRoute} from "@tanstack/react-router";
import {officialGeomacroAgentHandlers}
  from "../lib/official-geomacro-agent.server";

/** Official v1 agent interface: no second x402 or evidence engine. */
export const Route=createFileRoute("/api/v1/agent")({
 server:{handlers:officialGeomacroAgentHandlers()},
});
