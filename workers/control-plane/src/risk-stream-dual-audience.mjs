const ACTIONS=new Set(["CONTINUE","REDUCE_LIMIT","REQUIRE_APPROVAL","PAUSE"]);
const CATEGORIES=new Set(["GEOPOLITICS","MACRO_FX","CRITICAL_MINERALS"]);
const ASSETS=Object.freeze({
 GEOPOLITICS:["sovereign_risk","cross_border_trade","shipping_routes"],
 MACRO_FX:["foreign_exchange","interest_rates","sovereign_funding"],
 CRITICAL_MINERALS:["mineral_supply","industrial_inputs","shipping_routes"]
});
const MECHANISMS=Object.freeze({
 GEOPOLITICS:"Verified geopolitical constraints can change access, counterparties, and cross-border operating conditions.",
 MACRO_FX:"Verified macroeconomic observations can change currency, funding, and policy expectations.",
 CRITICAL_MINERALS:"Verified minerals observations can change input availability and supply-chain exposure."
});

/** Build a source-free, deterministic audience view from already-scored facts. */
export function buildRiskStreamDualAudience({category,eventClass="UNCLASSIFIED",
 score=0,confidence=0,horizonHours=24,ttlSeconds=10800,actionPosture,
 contagionCorridors=[]}={}){
 if(!CATEGORIES.has(category)||!Number.isFinite(score)||score<0||score>100||
    !Number.isFinite(confidence)||confidence<0||confidence>1||
    !Number.isInteger(horizonHours)||horizonHours<1||horizonHours>168||
    !Number.isInteger(ttlSeconds)||ttlSeconds<60||ttlSeconds>604800||
    !Array.isArray(contagionCorridors)||contagionCorridors.length>12||
    contagionCorridors.some(x=>typeof x!=="string"||! /^[A-Z]{3}>[A-Z]{3}$/u.test(x)))
  throw Error("RISK_STREAM_DUAL_AUDIENCE_INVALID");
 const posture=actionPosture??(score>=80?"PAUSE":score>=65?"REQUIRE_APPROVAL":
  score>=45?"REDUCE_LIMIT":"CONTINUE");
 if(!ACTIONS.has(posture))throw Error("RISK_STREAM_DUAL_AUDIENCE_INVALID");
 const bias=category==="MACRO_FX"?"VOLATILITY_UP":
  category==="CRITICAL_MINERALS"?"SUPPLY_DISRUPTION_RISK":
  "RISK_PREMIUM_UP";
 return {
  agent_decision:{action_posture:posture,risk_score_0_100:Number(score.toFixed(2)),
   confidence_0_1:Number(confidence.toFixed(3)),horizon_hours:horizonHours,
   affected_assets:[...ASSETS[category]],price_direction_bias:bias,
   contagion_corridors:[...new Set(contagionCorridors)].sort(),ttl_seconds:ttlSeconds},
  analyst_brief:{risk_mechanism:MECHANISMS[category],
   downstream_effects:category==="MACRO_FX"?
    "Funding costs, currency conversion, and risk limits may adjust if the observation persists.":
    category==="CRITICAL_MINERALS"?
     "Input availability, delivery timing, and downstream production costs may adjust if the observation persists.":
     "Counterparty access, transit reliability, and compliance exposure may adjust if the observation persists.",
   price_impact_summary:category==="MACRO_FX"?
    "Monitor volatility and repricing; this output does not forecast a guaranteed price move.":
    category==="CRITICAL_MINERALS"?
     "Monitor supply premiums and substitution risk; this output does not forecast a guaranteed price move.":
     "Monitor risk premia and route sensitivity; this output does not forecast a guaranteed price move.",
   cross_category_outlook:"Assess linked geopolitical, macroeconomic, and critical-minerals conditions using separately verified evidence."},
  raw_source_redacted:true
 };
}

export function validRiskStreamDualAudience(value){
 const agent=value?.agent_decision,brief=value?.analyst_brief;
 const agentKeys=["action_posture","risk_score_0_100","confidence_0_1",
  "horizon_hours","affected_assets","price_direction_bias","contagion_corridors","ttl_seconds"];
 const briefKeys=["risk_mechanism","downstream_effects","price_impact_summary","cross_category_outlook"];
 return value?.raw_source_redacted===true&&agent&&typeof agent==="object"&&
  Object.keys(agent).sort().join("|")===agentKeys.sort().join("|")&&
  ACTIONS.has(agent.action_posture)&&Number.isFinite(agent.risk_score_0_100)&&
  agent.risk_score_0_100>=0&&agent.risk_score_0_100<=100&&
  Number.isFinite(agent.confidence_0_1)&&agent.confidence_0_1>=0&&agent.confidence_0_1<=1&&
  Number.isInteger(agent.horizon_hours)&&agent.horizon_hours>=1&&
  Array.isArray(agent.affected_assets)&&agent.affected_assets.every(x=>
   typeof x==="string"&&/^[a-z0-9_]{2,48}$/u.test(x))&&
  typeof agent.price_direction_bias==="string"&&agent.price_direction_bias.length<=80&&
  Array.isArray(agent.contagion_corridors)&&agent.contagion_corridors.every(x=>
   typeof x==="string"&&/^[A-Z]{3}>[A-Z]{3}$/u.test(x))&&
  Number.isInteger(agent.ttl_seconds)&&agent.ttl_seconds>=60&&
  brief&&typeof brief==="object"&&
  Object.keys(brief).sort().join("|")===briefKeys.sort().join("|")&&
  ["risk_mechanism","downstream_effects","price_impact_summary","cross_category_outlook"]
   .every(key=>typeof brief[key]==="string"&&brief[key].length>=12&&brief[key].length<=360)&&
  // Only inspect the two audience products here. The signed score may also
  // contain the closed enum PRIVATE_OSINT / TELEGRAM_WATCH corroboration
  // family; that label is metadata, not a channel name or raw source text.
  !JSON.stringify({agent_decision:agent,analyst_brief:brief}).match(
   /https?:\/\/|www\.|@|telegram|headline|publisher|channel_name/iu);
}
