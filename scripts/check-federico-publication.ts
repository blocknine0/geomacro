import { dryRunCountryRiskObject } from "../src/lib/country-risk-publisher.server";
import { assertFedericoPublicationReady } from "../src/lib/federico-publication-policy";

const { object, context } = await dryRunCountryRiskObject({
  country_iso3: "CHN",
  delivery_profile: "FEDERICO_STRICT",
});

// Only counts and policy outcomes: no keys, raw articles or signed payloads.
console.log(JSON.stringify({
  published: false,
  evidence_summary: object.evidence_summary,
  decision_readiness: object.decision_readiness,
  commercial_eligibility: object.commercial_eligibility,
  verification: object.verification,
  context,
}, null, 2));
assertFedericoPublicationReady(object);
