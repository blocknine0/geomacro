import { createError, defineEventHandler, readMultipartFormData, setResponseHeaders } from "h3";

import { saveTestnetTesterAvatar } from "../../../src/lib/testnet-tester-avatar.server";
import { requireTesterPrincipal } from "../../../src/lib/testnet-tester-http.server";

export default defineEventHandler(async (event) => {
  setResponseHeaders(event, {
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  const session = await requireTesterPrincipal(event);
  try {
    const parts = await readMultipartFormData(event);
    const file = parts?.find((part) => part.name === "avatar" && part.data?.length);
    if (!file?.data) throw new Error("TESTNET_AVATAR_REQUIRED");
    const result = await saveTestnetTesterAvatar({
      principalId: session.principalId,
      bytes: new Uint8Array(file.data),
    });
    return {
      ok: true,
      data: {
        avatar_path: result.avatar_path,
        avatar_url: "/api/testnet-tester/avatar",
      },
      execution_authorized: false,
    };
  } catch (error) {
    const code = error instanceof Error ? error.message : "TESTNET_AVATAR_UPLOAD_FAILED";
    throw createError({ statusCode: 400, statusMessage: code.slice(0, 120) });
  }
});
