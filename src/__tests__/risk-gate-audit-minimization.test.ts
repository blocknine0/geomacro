import {
  readFileSync,
} from "node:fs";

import {
  describe,
  expect,
  it,
} from "vitest";

const migration =
  readFileSync(
    new URL(
      "../../supabase/migrations/032_risk_gate_audit_data_minimization.sql",
      import.meta.url,
    ),
    "utf8",
  );

describe(
  "Risk Gate audit data minimization contract",
  () => {
    it(
      "redacts new audit request payloads before immutable insert",
      () => {
        expect(migration).toContain(
          "minimize_risk_gate_audit_request_payload",
        );
        expect(migration).toContain(
          "before insert",
        );
        expect(migration).toContain(
          "'redacted', true",
        );
      },
    );

    it(
      "retains only policy identity rather than customer thresholds",
      () => {
        expect(migration).toContain(
          "'{policy,policy_id}'",
        );
        expect(migration).toContain(
          "'{policy,policy_version}'",
        );

        expect(migration).not.toContain(
          "'{policy,continue_max_score}'",
        );
        expect(migration).not.toContain(
          "'{policy,hard_stop_driver_contributions}'",
        );
      },
    );

    it(
      "does not persist action amount, destination or metadata values",
      () => {
        expect(migration).toContain(
          "'amount_present'",
        );
        expect(migration).toContain(
          "'destination_present'",
        );
        expect(migration).toContain(
          "'metadata_present'",
        );

        expect(migration).not.toContain(
          "'{action_context,amount}'",
        );
        expect(migration).not.toContain(
          "'{action_context,destination}'",
        );
        expect(migration).not.toContain(
          "'{action_context,metadata}'",
        );
      },
    );

    it(
      "does not rewrite historical immutable audit rows",
      () => {
        expect(
          migration.toLowerCase(),
        ).not.toContain(
          "update public.risk_gate_audit_log",
        );
      },
    );
  },
);
