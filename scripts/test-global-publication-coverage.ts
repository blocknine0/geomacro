import {
  evaluateGlobalPublicationCoverage,
  type GlobalPublicationCoverageInput,
} from "../src/lib/global-publication-coverage";

type TestCase = {
  name: string;
  input: GlobalPublicationCoverageInput;
  structural: boolean;
  gro: boolean;
  primaryGate: boolean;
};

const cases: TestCase[] = [
  {
    name:
      "India full coverage",

    input: {
      country_iso3:
        "IND",

      entity_scope:
        "SOVEREIGN",

      macro_available:
        true,

      geopolitics_available:
        true,

      current_event_coverage:
        "FULL",

      critical_minerals:
        "AVAILABLE",
    },

    structural:
      true,

    gro:
      true,

    primaryGate:
      true,
  },

  {
    name:
      "Brazil structured but no current event",

    input: {
      country_iso3:
        "BRA",

      entity_scope:
        "SOVEREIGN",

      macro_available:
        true,

      geopolitics_available:
        true,

      current_event_coverage:
        "NO_CURRENT_SIGNAL",

      critical_minerals:
        "AVAILABLE",
    },

    structural:
      true,

    gro:
      false,

    primaryGate:
      true,
  },

  {
    name:
      "South Africa structured but no current event",

    input: {
      country_iso3:
        "ZAF",

      entity_scope:
        "SOVEREIGN",

      macro_available:
        true,

      geopolitics_available:
        true,

      current_event_coverage:
        "NO_CURRENT_SIGNAL",

      critical_minerals:
        "AVAILABLE",
    },

    structural:
      true,

    gro:
      false,

    primaryGate:
      true,
  },

  {
    name:
      "Sovereign without mineral production data",

    input: {
      country_iso3:
        "LBN",

      entity_scope:
        "SOVEREIGN",

      macro_available:
        true,

      geopolitics_available:
        true,

      current_event_coverage:
        "PARTIAL",

      critical_minerals:
        "NOT_APPLICABLE",
    },

    structural:
      true,

    gro:
      true,

    primaryGate:
      true,
  },

  {
    name:
      "Territory has structured intelligence",

    input: {
      country_iso3:
        "GIB",

      entity_scope:
        "TERRITORY",

      macro_available:
        true,

      geopolitics_available:
        false,

      current_event_coverage:
        "NO_CURRENT_SIGNAL",

      critical_minerals:
        "NOT_APPLICABLE",
    },

    structural:
      true,

    gro:
      false,

    primaryGate:
      false,
  },

  {
    name:
      "Unclassified entity fails primary gate",

    input: {
      country_iso3:
        "ZZZ",

      entity_scope:
        "UNCLASSIFIED",

      macro_available:
        false,

      geopolitics_available:
        false,

      current_event_coverage:
        "NO_CURRENT_SIGNAL",

      critical_minerals:
        "UNKNOWN",
    },

    structural:
      false,

    gro:
      false,

    primaryGate:
      false,
  },
];

console.log(
  "===== GLOBAL PUBLICATION COVERAGE CONTRACT =====",
);

const rows =
  cases.map(
    test => {
      const result =
        evaluateGlobalPublicationCoverage(
          test.input,
        );

      if (
        result.structural_risk_available !==
        test.structural
      ) {
        throw new Error(
          `${test.name}: structural availability mismatch`,
        );
      }

      if (
        result.gro_v02_available !==
        test.gro
      ) {
        throw new Error(
          `${test.name}: GRO availability mismatch`,
        );
      }

      if (
        result.included_in_primary_global_gate !==
        test.primaryGate
      ) {
        throw new Error(
          `${test.name}: primary gate mismatch`,
        );
      }

      if (
        result.critical_minerals_blocks_gro !==
        false
      ) {
        throw new Error(
          `${test.name}: minerals must not block GRO v0.2`,
        );
      }

      return {
        case:
          test.name,

        country:
          result.country_iso3,

        scope:
          result.entity_scope,

        structured:
          result.structural_risk_available,

        event_usable:
          result.event_coverage_usable,

        gro:
          result.gro_v02_available,

        primary_gate:
          result.included_in_primary_global_gate,

        minerals_block:
          result.critical_minerals_blocks_gro,

        reasons:
          result.reason_codes.join(","),
      };
    },
  );

console.table(
  rows,
);

console.log(
  "PASS: STRUCTURED RISK AND GRO AVAILABILITY ARE DISTINCT",
);

console.log(
  "PASS: BRA/ZAF STRUCTURED RISK CAN EXIST WHILE GRO FAILS CLOSED",
);

console.log(
  "PASS: CRITICAL MINERALS DOES NOT BLOCK GRO v0.2",
);

console.log(
  "PASS: TERRITORIES DO NOT DISTORT PRIMARY SOVEREIGN COVERAGE GATE",
);
