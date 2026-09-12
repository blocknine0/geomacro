import { defineEventHandler } from "h3";

import baseTestnetAccessHandler from "./testnet-access.get";

type Handler = (event: unknown) => unknown | Promise<unknown>;

export default defineEventHandler(async (event) => {
  const html = await (baseTestnetAccessHandler as unknown as Handler)(event);
  if (typeof html !== "string") return html;

  return html.replace(
    '<script src="/testnet-access.js" defer></script>',
    '<script src="/testnet-access.js" defer></script>\n<script src="/testnet-wallet-first.js" defer></script>',
  );
});
