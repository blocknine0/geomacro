import {
  defineEventHandler,
  getRequestURL,
  setResponseHeaders,
} from "h3";

import { geomacroA2AManifest } from "../../../src/lib/a2a-contract";

export default defineEventHandler((event) => {
  setResponseHeaders(event, {
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "public, max-age=60",
    "X-Content-Type-Options": "nosniff",
  });
  return {
    ok: true,
    data: geomacroA2AManifest(getRequestURL(event).origin),
  };
});
