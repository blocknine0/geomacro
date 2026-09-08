import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { assertSameOrigin } from "./origin-guard";
import { readPublicGlobalRisk } from "./global-risk-read.server";
import type { GlobalRisk } from "./global-risk.types";

const EmptyInput = z.object({}).strict();

export const getPublicGlobalRisk = createServerFn({ method: "POST" })
  .validator((input: unknown) => EmptyInput.parse(input))
  .handler(async (): Promise<GlobalRisk> => {
    assertSameOrigin();
    return readPublicGlobalRisk();
  });
