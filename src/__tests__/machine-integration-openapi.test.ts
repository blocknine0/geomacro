import {
  readFileSync,
} from "node:fs";

import {
  describe,
  expect,
  it,
} from "vitest";


function source(
  path: string,
): string {
  return readFileSync(path, "utf8");
}


describe(
  "machine integration OpenAPI contract",
  () => {
    const openapi = source(
      "docs/openapi/geomacro-v1.yaml",
    );
    const sandboxRoute = source(
      "src/routes/api.demo.preflight.ts",
    );
    const sandboxService = source(
      "src/lib/agentic-demo-service.server.ts",
    );
    const demoContract = source(
      "src/lib/agentic-demo-contract.ts",
    );

    it(
      "documents the existing public preflight sandbox rather than leaving it as an undocumented product surface",
      () => {
        expect(openapi).toContain(
          "  /api/demo/preflight:",
        );
        expect(openapi).toContain(
          "operationId: runPublicRiskPreflightSandbox",
        );
        expect(sandboxRoute).toContain(
          'createFileRoute("/api/demo/preflight")',
        );
      },
    );

    it(
      "keeps the documented sandbox subject and policy bounds aligned with runtime",
      () => {
        expect(openapi).toContain(
          "enum: [USA, CHN]",
        );
        expect(openapi).toContain(
          "enum: [balanced, cautious, strict]",
        );
        expect(openapi).toContain(
          "enum: [treasury_payment, vendor_payment, agent_payment, exposure_review]",
        );

        expect(sandboxService).toContain(
          'DEMO_ALLOWED_COUNTRIES = ["USA", "CHN"]',
        );
        expect(sandboxService).toContain(
          'DEMO_ALLOWED_CORRIDORS = ["USA>CHN", "CHN>USA"]',
        );
        expect(demoContract).toContain(
          '["balanced", "cautious", "strict"]',
        );
        expect(demoContract).toContain(
          '"treasury_payment",',
        );
        expect(demoContract).toContain(
          '"vendor_payment",',
        );
        expect(demoContract).toContain(
          '"agent_payment",',
        );
        expect(demoContract).toContain(
          '"exposure_review",',
        );
      },
    );

    it(
      "documents the same request-size and non-execution boundaries enforced by runtime",
      () => {
        expect(openapi).toContain(
          "Sandbox payload exceeds the 8 KiB request bound",
        );
        expect(openapi).toContain(
          "execution_authorized:\n              const: false",
        );
        expect(openapi).toContain(
          "raw/private warehouse data is not exposed",
        );

        expect(sandboxRoute).toContain(
          "const MAX_BODY_BYTES = 8 * 1024;",
        );
        expect(sandboxRoute).toContain(
          "execution_authorized: false",
        );
        expect(sandboxService).toContain(
          "result.response.execution_authorized !== false",
        );
      },
    );

    it(
      "keeps Arc Testnet x402 separate from production commercial billing",
      () => {
        expect(openapi).toContain(
          "Arc Testnet x402",
        );
        expect(openapi).toContain(
          "is not production commercial billing",
        );
      },
    );
  },
);
