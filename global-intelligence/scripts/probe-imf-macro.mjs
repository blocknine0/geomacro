import {fetchImfDataMapper, fetchImfDataMapperCatalog} from "../adapters/imf-sdmx.mjs";

let failures = 0;

try {
  const rows = await fetchImfDataMapper({
    indicator: "NGDP_RPCH",
    countryIso3: "IND"
  });
  if (!rows.length) {
    failures++;
    console.log("FAIL IMF DataMapper IND NGDP_RPCH: no observations");
  } else {
    console.log(`PASS IMF DataMapper IND NGDP_RPCH: ${rows.length} observations`);
  }
} catch (error) {
  failures++;
  console.log(`FAIL IMF DataMapper query: ${error.message}`);
}

try {
  const catalog = await fetchImfDataMapperCatalog();
  const indicators = catalog.indicators;
  if (!indicators || (typeof indicators === "object" && !Object.keys(indicators).length)) {
    failures++;
    console.log("FAIL IMF DataMapper catalog: empty");
  } else {
    console.log("PASS IMF DataMapper catalog");
  }
} catch (error) {
  failures++;
  console.log(`FAIL IMF DataMapper catalog: ${error.message}`);
}

if (failures) process.exit(1);
