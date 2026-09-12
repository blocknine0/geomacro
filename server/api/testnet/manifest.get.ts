import {
  defineEventHandler,
  setResponseHeaders,
} from "h3";

import {
  testnetDeveloperApiManifest,
} from "../../../src/lib/testnet-developer-api-manifest";

export default defineEventHandler((event) => {
  setResponseHeaders(event, {
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "public, max-age=60",
    "X-Content-Type-Options": "nosniff",
  });

  return {
    ok: true,
    data: testnetDeveloperApiManifest(),
  };
});
