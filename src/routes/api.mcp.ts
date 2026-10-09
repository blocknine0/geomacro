import { createFileRoute } from "@tanstack/react-router";
import { geomacroMcpHandlers } from "../lib/geomacro-mcp.server";

export const Route = createFileRoute("/api/mcp")({
  server: {
    handlers: geomacroMcpHandlers,
  },
});
