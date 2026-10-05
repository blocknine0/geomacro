#!/usr/bin/env node

import { mkdirSync, writeFileSync } from "node:fs";
import { createGriDbClient } from "./lib/gri-db-client.mjs";
import { validateCommercialCorridorCensus } from "./lib/commercial-corridor-census.mjs";

const OUT = process.env.CORRIDOR_CENSUS_ARTIFACT || "artifacts/commercial-corridor-census.json";

async function main() {
  const db = createGriDbClient();
  const { data, error } = await db
    .from("live_commercial_corridor_registry_status")
    .select(
      "evaluated_at,registry_version,stable_id_contract,corridor_type,enabled_country_count,supported_directed_pair_count,invalid_enabled_iso3_rows,named_strategic_corridor_count,named_route_data_promoted_rows,composition_method,route_modeling_status,corridor_score_status,missing_route_evidence_behavior,commercial_corridor_registry_complete",
    )
    .single();

  if (error) throw new Error(`CORRIDOR_CENSUS_READ_FAILED:${error.message}`);
  const verified = validateCommercialCorridorCensus(data);
  const artifact = {
    schema: "geomacro.commercial-corridor-census-proof.v1",
    checked_at: new Date().toISOString(),
    evaluated_at: data?.evaluated_at ?? null,
    source: "public.live_commercial_corridor_registry_status",
    ...verified,
  };

  mkdirSync(OUT.split("/").slice(0, -1).join("/") || ".", { recursive: true });
  writeFileSync(OUT, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify(artifact)}\n`);
}

main().catch((error) => {
  console.error(error?.stack || error?.message || String(error));
  process.exit(1);
});
