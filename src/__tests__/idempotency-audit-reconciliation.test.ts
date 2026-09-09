import {
  createHash,
} from "node:crypto";
import {
  readFileSync,
} from "node:fs";

import {
  describe,
  expect,
  it,
} from "vitest";

import {
  canonicalJson,
} from "../lib/canonical-json";


function sha256(
  value: string,
): string {
  return createHash("sha256")
    .update(value)
    .digest("hex");
}


describe(
  "Risk Gate idempotency/audit reconciliation",
  () => {
    it(
      "demonstrates why canonical idempotency and original-order audit hashes are separate domains",
      () => {
        const left = {
          request_id: "req-1234",
          subject: {
            type: "country",
            country_iso3: "USA",
          },
          policy: {
            policy_id: "pilot",
            policy_version: "1",
          },
        };

        const right = {
          policy: {
            policy_version: "1",
            policy_id: "pilot",
          },
          subject: {
            country_iso3: "USA",
            type: "country",
          },
          request_id: "req-1234",
        };

        expect(
          canonicalJson(left),
        ).toBe(
          canonicalJson(right),
        );

        expect(
          sha256(
            canonicalJson(left),
          ),
        ).toBe(
          sha256(
            canonicalJson(right),
          ),
        );

        expect(
          sha256(
            JSON.stringify(left),
          ),
        ).not.toBe(
          sha256(
            JSON.stringify(right),
          ),
        );
      },
    );

    it(
      "reconciles delivered audits by exact claim identity/window instead of equating audit and idempotency hashes",
      () => {
        const migration =
          readFileSync(
            "supabase/migrations/045_idempotency_audit_reconciliation.sql",
            "utf8",
          );

        expect(migration).toContain(
          "same client_id + request_id + different canonical request hash remains CONFLICT",
        );
        expect(migration).toContain(
          "v_row.request_hash <> p_request_hash",
        );
        expect(migration).toContain(
          "audit.created_at >= v_row.created_at",
        );
        expect(migration).toContain(
          "audit.created_at <= v_row.expires_at",
        );
        expect(migration).toContain(
          "audit.execution_authorized = false",
        );
        expect(migration).toContain(
          "audit.http_status between 200 and 299",
        );
        expect(migration).not.toContain(
          "audit.request_hash = p_request_hash",
        );
      },
    );

    it(
      "rolls expired idempotency slots forward without destructive cleanup",
      () => {
        const migration =
          readFileSync(
            "supabase/migrations/045_idempotency_audit_reconciliation.sql",
            "utf8",
          );

        expect(migration).toContain(
          "expired idempotency slots roll forward in place",
        );
        expect(migration).toContain(
          "on conflict (",
        );
        expect(migration).toContain(
          "do update",
        );
        expect(migration).toContain(
          "public.risk_gate_idempotency_keys.expires_at <= v_now",
        );
        expect(migration).not.toContain(
          "delete from public.risk_gate_idempotency_keys",
        );
      },
    );

    it(
      "completes only the currently owned canonical claim from its matching delivered audit window",
      () => {
        const migration =
          readFileSync(
            "supabase/migrations/045_idempotency_audit_reconciliation.sql",
            "utf8",
          );

        expect(migration).toContain(
          "idem.request_hash = p_request_hash",
        );
        expect(migration).toContain(
          "idem.state = 'processing'",
        );
        expect(migration).toContain(
          "idem.claim_token = p_claim_token",
        );
        expect(migration).toContain(
          "audit.audit_id = p_audit_id",
        );
        expect(migration).toContain(
          "audit.client_id = p_client_id",
        );
        expect(migration).toContain(
          "audit.request_id = p_request_id",
        );
        expect(migration).toContain(
          "audit.created_at >= v_idem.created_at",
        );
        expect(migration).toContain(
          "audit.created_at <= v_idem.expires_at",
        );
      },
    );

    it(
      "preserves service-role-only RPC access",
      () => {
        const migration =
          readFileSync(
            "supabase/migrations/045_idempotency_audit_reconciliation.sql",
            "utf8",
          );

        expect(migration).toContain(
          "from PUBLIC, anon, authenticated",
        );
        expect(migration).toContain(
          "to service_role",
        );
      },
    );
  },
);
