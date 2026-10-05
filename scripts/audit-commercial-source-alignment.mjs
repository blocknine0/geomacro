#!/usr/bin/env node

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { createGriDbClient } from "./lib/gri-db-client.mjs";
import { validateCommercialSourceAlignment } from "./lib/commercial-source-alignment.mjs";

const out = process.env.COMMERCIAL_SOURCE_ALIGNMENT_ARTIFACT || "artifacts/commercial-source-alignment.json";

async function main() {
  const db = createGriDbClient();
  const { data, error } = await db
    .from("live_commercial_source_alignment_status")
    .select(
      "evaluated_at,source_count,certification_record_count,incomplete_inventory_metadata_rows,implicit_lifecycle_rows,unreviewed_rights_rows,active_untested_rows,ingestion_enabled_rows,commercial_signal_rows,unsafe_commercial_signal_rows,explicit_quarantined_inventory_rows,commercial_source_alignment_complete",
    )
    .single();

  if (error) throw new Error(`COMMERCIAL_SOURCE_ALIGNMENT_READ_FAILED:${error.message}`);
  const verified = validateCommercialSourceAlignment(data);
  const artifact = {
    schema: "geomacro.commercial-source-alignment-proof.v1",
    checked_at: new Date().toISOString(),
    evaluated_at: data?.evaluated_at ?? null,
    source: "public.live_commercial_source_alignment_status",
    ...verified,
  };

  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify(artifact)}\n`);
}

main().catch((error) => {
  console.error(error?.stack || error?.message || String(error));
  process.exit(1);
});
