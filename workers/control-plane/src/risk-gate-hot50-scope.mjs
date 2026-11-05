/** Owner-selected Risk Gate scope; broad source collection remains independent. */
export const RISK_GATE_HOT50=Object.freeze(["USA", "CHN", "IND", "RUS", "GBR", "DEU", "FRA", "JPN", "KOR", "BEL", "CAN", "AUS", "BRA", "MEX", "ITA", "ESP", "NLD", "CHE", "NOR", "SWE", "POL", "UKR", "TUR", "SAU", "ARE", "IRN", "ISR", "EGY", "QAT", "OMN", "IRQ", "ZAF", "NGA", "COD", "ZMB", "CHL", "PER", "ARG", "BOL", "IDN", "VNM", "THA", "MYS", "SGP", "PHL", "PAK", "BGD", "KAZ", "MNG", "MMR"]);
const members=new Set(RISK_GATE_HOT50);
export const hot50RiskGateEnabled=env=>env?.RISK_GATE_COUNTRY_SCOPE==="HOT50";
export const isHot50RiskCountry=id=>members.has(id);
export function activeRiskTargets(env,legacy){
 return hot50RiskGateEnabled(env)?RISK_GATE_HOT50.map(id=>({type:"COUNTRY",id})):legacy;
}
// Literal validated ISO3 values only; never include caller-controlled SQL.
export const HOT50_RISK_SQL="entity_type='COUNTRY' AND entity_id IN ("+
 RISK_GATE_HOT50.map(id=>"'"+id+"'").join(",")+")";
