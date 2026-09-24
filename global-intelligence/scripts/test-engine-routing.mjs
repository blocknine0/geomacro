import {routeQuestion} from "../engine/router.mjs";
import {defaultAdapters} from "../engine/default-adapters.mjs";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const geo = routeQuestion("What is the geopolitical conflict risk?");
assert(geo.includes("GEOPOLITICS") && !geo.includes("MACRO"), "geo routing failed");

const macro = routeQuestion("What are the current macro risks?");
assert(macro.includes("MACRO") && !macro.includes("GEOPOLITICS"), "explicit macro routing failed");

const minerals = routeQuestion("What are the current critical-mineral supply risks?");
assert(
  minerals.includes("CRITICAL_MINERALS") && !minerals.includes("MACRO"),
  "explicit critical-minerals routing failed",
);

const mixed = routeQuestion(
  "What are the current geopolitical, macro and critical-mineral risks affecting global trade?",
);
assert(
  mixed.includes("GEOPOLITICS") &&
    mixed.includes("MACRO") &&
    mixed.includes("CRITICAL_MINERALS"),
  "mixed three-category routing failed",
);

const macro = routeQuestion("What is inflation and GDP growth?");
assert(macro.includes("MACRO"), "macro routing failed");

const minerals = routeQuestion("What is cobalt supply and mine production?");
assert(minerals.includes("CRITICAL_MINERALS"), "minerals routing failed");

const mixed = routeQuestion("How could sanctions affect copper exports and inflation?");
assert(mixed.includes("GEOPOLITICS") && mixed.includes("CRITICAL_MINERALS") && mixed.includes("MACRO"), "multi-category routing failed");

const adapters = defaultAdapters();
assert(typeof adapters.GEOPOLITICS === "function", "geo adapter missing");
assert(typeof adapters.MACRO === "function", "macro adapter missing");
assert(typeof adapters.CRITICAL_MINERALS === "function", "minerals adapter missing");

console.log(JSON.stringify({ok:true, routing:["geo","macro","minerals","mixed"], adapters:["GEOPOLITICS","MACRO","CRITICAL_MINERALS"]}));
