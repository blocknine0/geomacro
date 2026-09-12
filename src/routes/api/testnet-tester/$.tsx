import { createFileRoute } from "@tanstack/react-router";

import { runH3Handler } from "@/lib/testnet-h3-bridge";

import authChallengePost from "../../../../server/api/testnet-tester/auth-challenge.post";
import authVerifyPost from "../../../../server/api/testnet-tester/auth-verify.post";
import avatarGet from "../../../../server/api/testnet-tester/avatar.get";
import avatarPost from "../../../../server/api/testnet-tester/avatar.post";
import cardGet from "../../../../server/api/testnet-tester/card.get";
import configGet from "../../../../server/api/testnet-tester/config.get";
import developerKeyRevokePost from "../../../../server/api/testnet-tester/developer-key-revoke.post";
import developerKeyPost from "../../../../server/api/testnet-tester/developer-key.post";
import developerKeysGet from "../../../../server/api/testnet-tester/developer-keys.get";
import intelligencePost from "../../../../server/api/testnet-tester/intelligence.post";
import logoutPost from "../../../../server/api/testnet-tester/logout.post";
import meGet from "../../../../server/api/testnet-tester/me.get";
import paymentClaimPost from "../../../../server/api/testnet-tester/payment-claim.post";
import registerPost from "../../../../server/api/testnet-tester/register.post";
import shareCardSlugGet from "../../../../server/api/testnet-tester/share-card/[slug].get";
import shareEventPost from "../../../../server/api/testnet-tester/share-event.post";
import sharePost from "../../../../server/api/testnet-tester/share.post";
import walletChallengePost from "../../../../server/api/testnet-tester/wallet-challenge.post";
import walletVerifyPost from "../../../../server/api/testnet-tester/wallet-verify.post";

type Handler = (event: unknown) => unknown | Promise<unknown>;

const GET_HANDLERS: Record<string, Handler> = {
  avatar: avatarGet as never,
  card: cardGet as never,
  config: configGet as never,
  "developer-keys": developerKeysGet as never,
  me: meGet as never,
};

const POST_HANDLERS: Record<string, Handler> = {
  "auth-challenge": authChallengePost as never,
  "auth-verify": authVerifyPost as never,
  avatar: avatarPost as never,
  "developer-key": developerKeyPost as never,
  "developer-key-revoke": developerKeyRevokePost as never,
  intelligence: intelligencePost as never,
  logout: logoutPost as never,
  "payment-claim": paymentClaimPost as never,
  register: registerPost as never,
  "share-event": shareEventPost as never,
  share: sharePost as never,
  "wallet-challenge": walletChallengePost as never,
  "wallet-verify": walletVerifyPost as never,
};

function notFound() {
  return Response.json(
    { ok: false, error: "NOT_FOUND", execution_authorized: false },
    { status: 404, headers: { "Cache-Control": "no-store" } },
  );
}

function normalizeSplat(splat: string | undefined) {
  return String(splat ?? "").replace(/^\/+|\/+$/g, "");
}

async function dispatch(
  request: Request,
  splat: string | undefined,
  table: Record<string, Handler>,
  method: "GET" | "POST",
) {
  const path = normalizeSplat(splat);

  const direct = table[path];
  if (direct) return runH3Handler(request, direct);

  if (method === "GET" && path.startsWith("share-card/")) {
    const slug = path.slice("share-card/".length);
    if (slug && !slug.includes("/")) {
      return runH3Handler(request, shareCardSlugGet as never, { slug });
    }
  }

  return notFound();
}

export const Route = createFileRoute("/api/testnet-tester/$")({
  server: {
    handlers: {
      GET: async ({ request, params }) =>
        dispatch(request, (params as { _splat?: string })._splat, GET_HANDLERS, "GET"),
      POST: async ({ request, params }) =>
        dispatch(request, (params as { _splat?: string })._splat, POST_HANDLERS, "POST"),
    },
  },
});
