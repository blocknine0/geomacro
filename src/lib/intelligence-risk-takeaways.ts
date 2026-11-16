import type {StatelessCategory} from "./stateless-intelligence-model";

/** Source-neutral educational pathways; these do not score or verify events. */
export function intelligenceRiskTakeaways(category:StatelessCategory){
  switch(category){
    case "geopolitics":return {
      mechanism:"Policy, security or diplomatic change can alter access, settlement or operating assumptions.",
      effect:"Track implementation, affected jurisdictions and whether cross-border operations are directly exposed.",
      market:"FX exposure · freight and energy commodities · regional trade corridors",
      posture:"OBSERVE · VERIFY",
    };
    case "macro":return {
      mechanism:"Economic releases and policy decisions can shift rate, liquidity and external-balance expectations.",
      effect:"Compare the published period and figures with prior data, then check market pricing before inferring a move.",
      market:"FX and rates · energy and metals · funding corridors",
      posture:"OBSERVE · VERIFY",
    };
    case "rare_earth":return {
      mechanism:"Trade rules, processing capacity or project milestones can change strategic-input exposure.",
      effect:"Verify material, supply-chain stage and operating status before treating a plan as available supply.",
      market:"Critical-mineral inputs · battery and technology supply chains · trade corridors",
      posture:"OBSERVE · VERIFY",
    };
  }
}
