import type {
  GeomacroRiskObject,
} from "./risk-object-contract";

import type {
  CountryMacroRiskComponent,
} from "./country-risk-v02-macro-contract";

import type {
  CountryGeopoliticalRiskComponent,
} from "./country-risk-v02-geopolitics-contract";

import type {
  CountryRiskV02Context,
} from "./country-risk-v02-contract";


export const COUNTRY_RISK_V02_OBJECT_METHOD_VERSION =
  "country-risk-v0.2.0-integrated-pilot" as const;


export type CountryRiskV02IntegratedObject = {
  methodology_version:
    typeof COUNTRY_RISK_V02_OBJECT_METHOD_VERSION;

  country_iso3:
    string;

  country_name:
    string | null;

  as_of:
    string;

  base_event_risk: {
    methodology_version:
      string;

    object_id:
      string;

    /**
     * Whether the event component contains usable
     * measured evidence.
     *
     * A numeric zero with zero confidence is not
     * interpreted as measured zero risk.
     */
    available:
      boolean;

    score:
      number | null;

    confidence:
      number;

    exclusion_reason:
      string | null;

    calculation_hash:
      string;
  };

  macro_component:
    CountryMacroRiskComponent;

  geopolitics_component:
    CountryGeopoliticalRiskComponent;

  cis_context:
    CountryRiskV02Context;

  availability: {
    status:
      "FULL"
      | "EVENT_ONLY"
      | "MACRO_ONLY"
      | "UNAVAILABLE";

    event_available:
      boolean;

    macro_available:
      boolean;

    composite_score_available:
      boolean;

    exclusion_reason:
      string | null;
  };

  weights: {
    event_risk:
      0.6;

    macro:
      0.2;

    geopolitics:
      0.2;

    critical_minerals:
      0;
  };

  score: {
    event_contribution:
      number | null;

    macro_contribution:
      number | null;

    geopolitics_contribution:
      number | null;

    final_score:
      number | null;
  };

  confidence: {
    event_confidence:
      number;

    macro_confidence:
      number;

    geopolitics_confidence:
      number;

    final_confidence:
      number;
  };

  exclusions: {
    geopolitics:
      string | null;

    critical_minerals:
      string;
  };

  integrity: {
    base_event_hash:
      string;

    macro_hash:
      string;

    cis_hash:
      string;

    calculation_hash:
      string;
  };
};
