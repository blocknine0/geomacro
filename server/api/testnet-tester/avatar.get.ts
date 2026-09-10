import { createError, defineEventHandler, setResponseHeaders } from "h3";

import { loadTestnetTesterAvatar } from "../../../src/lib/testnet-tester-avatar.server";
import { requireTesterPrincipal } from "../../../src/lib/testnet-tester-http.server";

export default defineEventHandler(async (event) => {
  const session = await requireTesterPrincipal(event);
  try {
    const avatar = await loadTestnetTesterAvatar(session.principalId);
    setResponseHeaders(event, {
      "Content-Type": avatar.content_type,
      "Content-Length": String(avatar.bytes.byteLength),
      "Cache-Control": "private, max-age=300",
      "X-Content-Type-Options": "nosniff",
    });
    return Buffer.from(avatar.bytes);
  } catch (error) {
    const code = error instanceof Error ? error.message : "TESTNET_AVATAR_NOT_FOUND";
    throw createError({ statusCode: 404, statusMessage: code.slice(0, 120) });
  }
});
