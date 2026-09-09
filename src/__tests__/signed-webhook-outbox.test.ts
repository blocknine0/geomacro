import {
  generateKeyPairSync,
} from "node:crypto";
import {
  readFileSync,
} from "node:fs";

import {
  afterEach,
  describe,
  expect,
  it,
} from "vitest";

import type {
  RiskGateResponse,
} from "../lib/risk-gate-contract";
import {
  buildRiskGateDecisionWebhookEvent,
} from "../lib/webhook-event-contract";
import {
  signWebhookEvent,
  verifyWebhookEventSignature,
  webhookOutboxEnabled,
} from "../lib/webhook-event-signing.server";


const originalWebhookEnabled =
  process.env
    .WEBHOOK_OUTBOX_ENABLED;


afterEach(() => {
  if (
    originalWebhookEnabled ===
    undefined
  ) {
    delete process.env
      .WEBHOOK_OUTBOX_ENABLED;
  } else {
    process.env
      .WEBHOOK_OUTBOX_ENABLED =
      originalWebhookEnabled;
  }
});


function decision():
  RiskGateResponse {
  return {
    schema_version:
      "risk-gate-1.0",
    request_id:
      "request-1234",
    decision:
      "REQUIRE_APPROVAL",
    recommended_action:
      "REQUIRE_HUMAN_APPROVAL",
    reason_codes: [
      "risk_score_require_approval",
    ],
    counterfactual: {
      version:
        "risk-gate-counterfactual-v1.0.0",
      current_action:
        "REQUIRE_HUMAN_APPROVAL",
      next_less_restrictive_action:
        "REDUCE_EXPOSURE",
      blockers: [
        {
          type: "score",
          reason_code:
            "score_must_fall_below_next_policy_threshold",
          current_value: 64,
          required_value: 50,
          delta_required: -14,
        },
      ],
      note:
        "Counterfactual context only; it never authorizes execution.",
    },
    subject: {
      type: "corridor",
      id: "USA>CHN",
      name: "USA to China",
    },
    risk: {
      object_id:
        "gro_corridor_test",
      score: 64,
      label: "ELEVATED",
      previous_score: 58,
      delta: 6,
      confidence: 0.88,
      verification_status:
        "VERIFIED",
      commercial_eligibility_status:
        "VERIFIED",
      generated_at:
        "2026-09-09T18:00:00.000Z",
      expires_at:
        "2026-09-09T21:00:00.000Z",
      methodology_version:
        "corridor-endpoint-max-v0.1.0-pilot",
    },
    top_drivers: [
      {
        driver: "trade_policy",
        score_contribution: 31,
        delta_contribution: 4,
      },
    ],
    policy: {
      policy_id:
        "treasury-cautious",
      policy_version:
        "1.0.0",
    },
    execution_authorized:
      false,
  };
}


function signingMaterial() {
  const {
    privateKey,
    publicKey,
  } = generateKeyPairSync(
    "ed25519",
  );

  return {
    material: {
      key_id:
        "geomacro-webhook-test-1",
      private_key_pkcs8_b64:
        Buffer.from(
          privateKey.export({
            format: "der",
            type: "pkcs8",
          }),
        ).toString("base64"),
      public_key_spki_b64:
        Buffer.from(
          publicKey.export({
            format: "der",
            type: "spki",
          }),
        ).toString("base64"),
    },
    publicKeySpkiB64:
      Buffer.from(
        publicKey.export({
          format: "der",
          type: "spki",
        }),
      ).toString("base64"),
  };
}


describe(
  "signed webhook outbox contract",
  () => {
    it(
      "builds a bounded structured event that can never authorize execution",
      () => {
        const event =
          buildRiskGateDecisionWebhookEvent({
            event_id:
              "gwe_1234",
            client_id:
              "pilot.client",
            audit_id:
              "rga_1234",
            occurred_at:
              "2026-09-09T18:01:00.000Z",
            risk_gate:
              decision(),
          });

        expect(
          event.data
            .execution_authorized,
        ).toBe(false);
        expect(event).not.toHaveProperty(
          "request_payload",
        );
        expect(event).not.toHaveProperty(
          "raw_data",
        );
        expect(
          JSON.stringify(event),
        ).not.toContain(
          "action_context",
        );
      },
    );

    it(
      "signs with a dedicated Ed25519 key and detects tampering",
      () => {
        const {
          material,
          publicKeySpkiB64,
        } = signingMaterial();

        const signed =
          signWebhookEvent(
            buildRiskGateDecisionWebhookEvent({
              event_id:
                "gwe_1234",
              client_id:
                "pilot.client",
              audit_id:
                "rga_1234",
              occurred_at:
                "2026-09-09T18:01:00.000Z",
              risk_gate:
                decision(),
            }),
            material,
          );

        expect(
          signed.integrity
            .payload_hash,
        ).toMatch(
          /^[a-f0-9]{64}$/,
        );
        expect(
          signed.integrity
            .signature_scheme,
        ).toBe("Ed25519");
        expect(
          verifyWebhookEventSignature(
            signed,
            publicKeySpkiB64,
          ),
        ).toBe(true);

        const tampered = {
          ...signed,
          data: {
            ...signed.data,
            decision:
              "CONTINUE" as const,
          },
        };

        expect(
          verifyWebhookEventSignature(
            tampered,
            publicKeySpkiB64,
          ),
        ).toBe(false);
      },
    );

    it(
      "keeps webhook outbox disabled by default and requires explicit rollout",
      () => {
        delete process.env
          .WEBHOOK_OUTBOX_ENABLED;
        expect(
          webhookOutboxEnabled(),
        ).toBe(false);

        process.env
          .WEBHOOK_OUTBOX_ENABLED =
          "true";
        expect(
          webhookOutboxEnabled(),
        ).toBe(true);
      },
    );

    it(
      "keeps webhook signing keys isolated from Risk Object signing keys",
      () => {
        const source =
          readFileSync(
            "src/lib/webhook-event-signing.server.ts",
            "utf8",
          );

        expect(source).toContain(
          "WEBHOOK_SIGNING_KEY_ID",
        );
        expect(source).toContain(
          "WEBHOOK_SIGNING_PRIVATE_KEY_PKCS8_B64",
        );
        expect(source).not.toContain(
          "RISK_OBJECT_SIGNING_PRIVATE_KEY_PKCS8_B64",
        );
      },
    );

    it(
      "makes the database event source immutable, service-role only and execution-safe",
      () => {
        const migration =
          readFileSync(
            "supabase/migrations/044_signed_webhook_event_outbox.sql",
            "utf8",
          );

        expect(migration).toContain(
          "public.webhook_event_outbox",
        );
        expect(migration).toContain(
          "before update or delete",
        );
        expect(migration).toContain(
          "enable row level security",
        );
        expect(migration).toContain(
          "from PUBLIC, anon, authenticated",
        );
        expect(migration).toContain(
          "to service_role",
        );
        expect(migration).toContain(
          "'execution_authorized' = 'false'::jsonb",
        );
        expect(migration).not.toMatch(
          /https?:\/\//,
        );
      },
    );

    it(
      "reconciles the signed outbox on both first delivery and idempotent replay without outbound fetch",
      () => {
        const wrapper =
          readFileSync(
            "src/lib/risk-gate-idempotency.server.ts",
            "utf8",
          );
        const outbox =
          readFileSync(
            "src/lib/webhook-event-outbox.server.ts",
            "utf8",
          );

        expect(wrapper.match(
          /ensureWebhookBeforeDelivery\(/g,
        )?.length).toBeGreaterThanOrEqual(3);
        expect(wrapper).toContain(
          "claim.disposition === \"REPLAY\"",
        );
        expect(wrapper).toContain(
          "Do not release the claim here",
        );
        expect(outbox).not.toContain(
          "fetch(",
        );
        expect(outbox).not.toContain(
          "endpoint_url",
        );
      },
    );
  },
);
