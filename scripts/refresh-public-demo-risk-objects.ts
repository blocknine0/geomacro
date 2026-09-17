#!/usr/bin/env bun

import {
  publishCountryRiskObject,
} from "../src/lib/country-risk-publisher.server";

import {
  publishCorridorRiskObject,
} from "../src/lib/corridor-risk-publisher.server";

import {
  runAgenticPreflightDemo,
} from "../src/lib/agentic-demo-service.server";

import {
  verifyRiskObjectSignature,
} from "../src/lib/risk-object-signing.server";

const COUNTRY_IDS = ["USA", "CHN"] as const;
const CORRIDORS = [
  ["USA", "CHN"],
  ["CHN", "USA"],
] as const;

function assertFresh(expiresAt: string, now: Date) {
  const expiry = new Date(expiresAt);
  if (Number.isNaN(expiry.getTime()) || expiry.getTime() <= now.getTime()) {
    throw new Error(`Published Risk Object is not fresh: ${expiresAt}`);
  }
}

function assertSignature(object: { integrity: { signature?: string | null }; expires_at: string }) {
  const report = verifyRiskObjectSignature(object as never);
  if (!report.valid) {
    throw new Error(`Published Risk Object signature invalid: ${report.reason}`);
  }
}

async function main() {
  const asOf = new Date();
  const asOfIso = asOf.toISOString();

  const countries = new Map<string, Awaited<ReturnType<typeof publishCountryRiskObject>>>();

  for (const country of COUNTRY_IDS) {
    const result = await publishCountryRiskObject({
      country_iso3: country,
      as_of: asOfIso,
    });

    assertSignature(result.object);
    assertFresh(result.object.expires_at, asOf);

    countries.set(country, result);
  }

  const corridors = [];
  for (const [origin, destination] of CORRIDORS) {
    const result = await publishCorridorRiskObject({
      origin_country_iso3: origin,
      destination_country_iso3: destination,
      as_of: asOfIso,
    });

    assertSignature(result.object);
    assertFresh(result.object.expires_at, asOf);
    corridors.push(result);
  }

  console.error(
    "PUBLIC_DEMO_PUBLICATION_STATUS " +
      JSON.stringify({
        countries: COUNTRY_IDS.map((country) => {
          const object = countries.get(country)!.object;
          return {
            country,
            object_id: object.object_id,
            verification_status: object.verification.status,
            commercial_eligibility_status: object.commercial_eligibility.status,
            expires_at: object.expires_at,
          };
        }),
        corridors: corridors.map((result) => ({
          corridor: result.object.subject.id,
          object_id: result.object.object_id,
          verification_status: result.object.verification.status,
          commercial_eligibility_status:
            result.object.commercial_eligibility.status,
          expires_at: result.object.expires_at,
        })),
      }),
  );

  const scenarios = [
    {
      name: "USA>CHN",
      input: {
        subject: {
          type: "corridor" as const,
          origin_country_iso3: "USA",
          destination_country_iso3: "CHN",
        },
        policy_preset: "cautious" as const,
        action_type: "agent_payment",
        amount_usdc: 10_000,
      },
    },
    {
      name: "CHN>USA",
      input: {
        subject: {
          type: "corridor" as const,
          origin_country_iso3: "CHN",
          destination_country_iso3: "USA",
        },
        policy_preset: "cautious" as const,
        action_type: "agent_payment",
        amount_usdc: 10_000,
      },
    },
    {
      name: "USA",
      input: {
        subject: {
          type: "country" as const,
          country_iso3: "USA",
        },
        policy_preset: "cautious" as const,
        action_type: "agent_payment",
        amount_usdc: 10_000,
      },
    },
    {
      name: "CHN",
      input: {
        subject: {
          type: "country" as const,
          country_iso3: "CHN",
        },
        policy_preset: "cautious" as const,
        action_type: "agent_payment",
        amount_usdc: 10_000,
      },
    },
  ];

  const demoResults = [];
  for (const scenario of scenarios) {
    const result = await runAgenticPreflightDemo(
      scenario.input,
      {
        mode: "PUBLIC_SANDBOX",
        recordTelemetry: false,
      },
    );

    if (result.ok !== true) {
      throw new Error(`Public demo scenario failed: ${scenario.name}`);
    }

    if (result.risk_gate.execution_authorized !== false) {
      throw new Error(`Execution boundary violated for demo scenario: ${scenario.name}`);
    }

    demoResults.push({
      scenario: scenario.name,
      object_id: result.risk_object.object_id,
      expires_at: result.risk_object.expires_at,
      verification_status: result.risk_gate.risk.verification_status,
      commercial_eligibility_status:
        result.risk_gate.risk.commercial_eligibility_status,
      decision: result.risk_gate.decision,
    });
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        refreshed_at: asOfIso,
        countries: COUNTRY_IDS.map((country) => {
          const object = countries.get(country)!.object;
          return {
            country,
            object_id: object.object_id,
            expires_at: object.expires_at,
            verification_status: object.verification.status,
            commercial_eligibility_status: object.commercial_eligibility.status,
            signing_key_id: object.integrity.signing_key_id,
          };
        }),
        corridors: corridors.map((result) => ({
          corridor: result.object.subject.id,
          object_id: result.object.object_id,
          expires_at: result.object.expires_at,
          verification_status: result.object.verification.status,
          commercial_eligibility_status:
            result.object.commercial_eligibility.status,
          signing_key_id: result.object.integrity.signing_key_id,
        })),
        demo_results: demoResults,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error("PUBLIC_DEMO_REFRESH_FAILED");
  console.error(error);
  process.exit(1);
});
