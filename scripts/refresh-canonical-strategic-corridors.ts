#!/usr/bin/env bun

import { publishCorridorRiskObject } from "../src/lib/corridor-risk-publisher.server";
import { verifyRiskObjectSignature } from "../src/lib/risk-object-signing.server";

const DEFAULT_PAIRS = ["USA>CHN", "CHN>USA"] as const;

function parsePairs() {
  const configured = String(process.env.GEOMACRO_CANONICAL_CORRIDOR_PAIRS ?? "").trim();
  const raw = configured ? configured.split(",") : [...DEFAULT_PAIRS];
  const pairs = raw.map((value) => value.trim()).filter(Boolean).map((value) => {
    const [origin, destination, extra] = value.split(">").map((part) => part?.trim().toUpperCase());
    if (extra || !origin || !destination || !/^[A-Z]{3}$/.test(origin) || !/^[A-Z]{3}$/.test(destination) || origin === destination) {
      throw new Error(`Invalid canonical corridor pair: ${value}`);
    }
    return [origin, destination] as const;
  });
  return [...new Map(pairs.map((pair) => [`${pair[0]}>${pair[1]}`, pair])).values()];
}

function assertFresh(expiresAt: string, now: Date) {
  const expires = Date.parse(expiresAt);
  if (!Number.isFinite(expires) || expires <= now.getTime()) {
    throw new Error(`Canonical corridor Risk Object is not fresh: ${expiresAt}`);
  }
}

async function main() {
  const now = new Date();
  const asOf = now.toISOString();
  const pairs = parsePairs();
  if (pairs.length === 0) throw new Error("No canonical strategic corridor pairs configured");

  const results = [];
  for (const [origin, destination] of pairs) {
    const published = await publishCorridorRiskObject({
      origin_country_iso3: origin,
      destination_country_iso3: destination,
      as_of: asOf,
      delivery_profile: "CANONICAL",
    });

    const verification = verifyRiskObjectSignature(published.object);
    if (!verification.valid) {
      throw new Error(`Canonical corridor signature invalid for ${origin}>${destination}: ${verification.reason}`);
    }
    assertFresh(published.object.expires_at, now);
    if (published.object.commercial_eligibility.status !== "VERIFIED") {
      throw new Error(`Canonical corridor is not commercially verified: ${origin}>${destination}`);
    }

    results.push({
      corridor: `${origin}>${destination}`,
      object_id: published.object.object_id,
      verification_status: published.object.verification.status,
      commercial_eligibility_status: published.object.commercial_eligibility.status,
      expires_at: published.object.expires_at,
      published: published.context.published,
    });
  }

  console.log(JSON.stringify({
    schema_version: "geomacro-canonical-strategic-corridor-refresh-v1",
    generated_at: asOf,
    pair_count: pairs.length,
    corridors: results,
    boundaries: {
      delivery_profile: "CANONICAL",
      payment_performed: false,
      execution_authorized: false,
      mainnet_activation_changed: false,
      raw_source_material_emitted: false,
    },
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
