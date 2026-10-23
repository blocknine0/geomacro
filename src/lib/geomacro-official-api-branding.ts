/**
 * Official GEOMACRO API product names are brand labels, NOT HTTP verbs.
 * Keep method and path separate to preserve existing integration, route,
 * signed request, 402 quote and payment-resource compatibility.
 */
export const GEOMACRO_OFFICIAL_API_CATALOG = Object.freeze([
  {id:"intelligence",name:"GEOMACRO Intelligence API",
    method:"POST",path:"/api/v1/intelligence/query"},
  {id:"geopolitics",name:"GEOMACRO Geopolitics API",
    method:"POST",path:"/api/v1/intelligence/geopolitics"},
  {id:"macro_fx",name:"GEOMACRO Macro/FX API",
    method:"POST",path:"/api/v1/intelligence/macro-fx"},
  {id:"critical_minerals",name:"GEOMACRO Critical Minerals API",
    method:"POST",path:"/api/v1/intelligence/critical-minerals"},
  {id:"agent",name:"GEOMACRO AI Agent API",
    method:"POST",path:"/api/v1/agent"},
] as const);

export const GEOMACRO_OFFICIAL_API_DISPLAY_NAMES = Object.freeze(
  Object.fromEntries(GEOMACRO_OFFICIAL_API_CATALOG.map(({id,name})=>[id,name]))
  as Record<(typeof GEOMACRO_OFFICIAL_API_CATALOG)[number]["id"],string>
);
