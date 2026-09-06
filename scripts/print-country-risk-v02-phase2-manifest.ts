import {
  getCountryRiskV02Phase2FreezeManifest,
} from "../src/lib/country-risk-v02-methodology-freeze";


console.log(
  JSON.stringify(
    getCountryRiskV02Phase2FreezeManifest(),
    null,
    2,
  ),
);
