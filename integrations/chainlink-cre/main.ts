import {
  consensusIdenticalAggregation,
  HTTPCapability,
  HTTPClient,
  type HTTPPayload,
  type HTTPSendRequester,
  handler,
  json,
  ok,
  Runner,
  type Runtime,
} from "@chainlink/cre-sdk";
import { z } from "zod";

const configSchema = z.object({
  geomacroCapabilitiesUrl: z.string().url(),
});

type Config = z.infer<typeof configSchema>;

const capabilitiesSchema = z.object({
  ok: z.literal(true),
  provider: z.object({
    id: z.literal("geomacro"),
    name: z.literal("Geomacro"),
    endpoint: z.string(),
  }),
  product: z.object({
    id: z.string(),
    response_schema: z.string(),
    contract_version: z.string(),
    delivery: z.literal("x402"),
    asset: z.literal("USDC"),
  }),
  intelligence: z.object({
    current_state: z.boolean(),
    change_attribution: z.boolean(),
    freshness: z.boolean(),
    state_version: z.boolean(),
    signed_risk_object_attestation: z.boolean(),
  }),
  commercial_boundary: z.object({
    raw_source_identity_exposed: z.boolean(),
    raw_article_material_exposed: z.boolean(),
    source_names_in_paid_response: z.boolean(),
    execution_authorized: z.boolean(),
  }),
});

type GeomacroCapabilityProof = z.infer<typeof capabilitiesSchema>;

const fetchGeomacroCapabilities = (
  sendRequester: HTTPSendRequester,
  config: Config,
): GeomacroCapabilityProof => {
  const response = sendRequester
    .sendRequest({ url: config.geomacroCapabilitiesUrl, method: "GET" })
    .result();

  if (!ok(response)) {
    throw new Error(`Geomacro capability discovery failed with status ${response.statusCode}`);
  }

  const parsed = capabilitiesSchema.parse(json(response));

  if (parsed.commercial_boundary.execution_authorized) {
    throw new Error("Geomacro capability discovery must remain read-only");
  }

  return parsed;
};

const onHTTPTrigger = async (runtime: Runtime<Config>, _payload: HTTPPayload) => {
  const httpClient = new HTTPClient();

  return httpClient
    .sendRequest(
      runtime,
      fetchGeomacroCapabilities,
      consensusIdenticalAggregation(),
    )(runtime.config)
    .result();
};

const initWorkflow = () => {
  const httpTrigger = new HTTPCapability();
  return [handler(httpTrigger.trigger({}), onHTTPTrigger)];
};

export async function main() {
  const runner = await Runner.newRunner<Config>({ configSchema });
  await runner.run(initWorkflow);
}
