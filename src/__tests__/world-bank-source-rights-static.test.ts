import {
  readFileSync,
} from "node:fs";

import {
  describe,
  expect,
  it,
} from "vitest";


const adapter =
  readFileSync(
    new URL(
      "../../scripts/ingest-world-bank-live.mjs",
      import.meta.url,
    ),
    "utf8",
  );

const operationalMigration =
  readFileSync(
    new URL(
      "../../supabase/migrations/025_external_source_operational_status.sql",
      import.meta.url,
    ),
    "utf8",
  );


describe(
  "World Bank live commercial source contract",
  () => {
    it(
      "pins the Indicators API to World Development Indicators source 2",
      () => {
        expect(
          adapter,
        ).toContain(
          'const WORLD_BANK_API_SOURCE_ID =\n  "2"',
        );

        expect(
          adapter,
        ).toContain(
          "source=${WORLD_BANK_API_SOURCE_ID}",
        );

        expect(
          adapter,
        ).toContain(
          '"World Development Indicators"',
        );
      },
    );

    it(
      "persists dataset-level licence provenance for every observation",
      () => {
        expect(
          adapter,
        ).toContain(
          "world_bank_api_source_id:",
        );

        expect(
          adapter,
        ).toContain(
          "licence_reference:",
        );

        expect(
          adapter,
        ).toContain(
          '"CC BY 4.0"',
        );

        expect(
          adapter,
        ).toContain(
          "WORLD_BANK_DATASET_TERMS_URL",
        );
      },
    );

    it(
      "keeps the reviewed World Bank adapter explicitly commercial-verified",
      () => {
        expect(
          adapter,
        ).toContain(
          'commercial_eligibility_status:\n        "VERIFIED"',
        );
      },
    );

    it(
      "keeps operational commercial enablement limited to reviewed live adapters",
      () => {
        expect(
          operationalMigration,
        ).toContain(
          "'world_bank_indicators'",
        );

        expect(
          operationalMigration,
        ).toContain(
          "'unhcr_refugee_statistics'",
        );

        expect(
          operationalMigration,
        ).toContain(
          "'usgs_mcs'",
        );

        expect(
          operationalMigration,
        ).toContain(
          "enabled_for_commercial_signals = false",
        );
      },
    );
  },
);
