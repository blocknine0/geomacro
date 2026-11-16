import type {StatelessCategory,StatelessIntelligenceSignal} from "./stateless-intelligence-model";

/** Source-neutral educational pathways; these do not score or verify events. */
export function intelligenceRiskTakeaways(category:StatelessCategory,signal?:StatelessIntelligenceSignal){
  const concrete=signal?.why_it_matters?.match(/^Risk: (.+?) Effect: (.+?) Price channel to monitor: (.+?) Action Posture: (CONTINUE|REDUCE_LIMIT|REQUIRE_APPROVAL|PAUSE);/u);
  if(concrete)return {mechanism:concrete[1],effect:concrete[2],market:concrete[3],posture:concrete[4]};
  if(signal){
    const headline=signal.title.replace(/^Geomacro finds\s+/iu,"");
    const place=signal.geography?" — "+signal.geography:"";
    const topic=signal.topic||category;
    const subject=topic+place;
    const text=(headline+" "+topic).toLocaleLowerCase();
    const currency:Record<string,string>={japan:"USD/JPY",india:"USD/INR",china:"USD/CNH",
      "united kingdom":"GBP/USD",canada:"USD/CAD",australia:"AUD/USD",switzerland:"USD/CHF",
      "south korea":"USD/KRW",brazil:"USD/BRL",mexico:"USD/MXN"};
    let market=category==="macro"?(currency[(signal.geography??"").toLocaleLowerCase()]??"local currency versus USD and sovereign yields"):
      category==="rare_earth"?/\bcopper\b/u.test(text)?"COMEX copper benchmark":/\blithium\b/u.test(text)?"battery-grade lithium carbonate benchmark":/\bnickel\b/u.test(text)?"LME nickel benchmark":/\bcobalt\b/u.test(text)?"cobalt metal and hydroxide benchmarks":/\bgraphite\b/u.test(text)?"battery-grade graphite and anode material benchmarks":"mineral benchmark and processing charges":
      /maritime|shipping|corridor|tanker|vessel/u.test(text)?"freight and marine insurance rates":(currency[(signal.geography??"").toLocaleLowerCase()]??"local currency versus USD")+" and sovereign spreads";
    return {mechanism:subject+" · "+headline,effect:signal.why_it_matters,market,
      posture:signal.status==="osint_feed_observed_unverified"?"REQUIRE_APPROVAL":"CONTINUE"};
  }
  switch(category){
    case "geopolitics":return {
      mechanism:"Policy, security or diplomatic change can alter access, settlement or operating assumptions.",
      effect:"Track implementation, affected jurisdictions and whether cross-border operations are directly exposed.",
      market:"FX exposure · freight and energy commodities · regional trade corridors",
      posture:"CONTINUE",
    };
    case "macro":return {
      mechanism:"Economic releases and policy decisions can shift rate, liquidity and external-balance expectations.",
      effect:"Compare the published period and figures with prior data, then check market pricing before inferring a move.",
      market:"FX and rates · energy and metals · funding corridors",
      posture:"CONTINUE",
    };
    case "rare_earth":return {
      mechanism:"Trade rules, processing capacity or project milestones can change strategic-input exposure.",
      effect:"Verify material, supply-chain stage and operating status before treating a plan as available supply.",
      market:"Critical-mineral inputs · battery and technology supply chains · trade corridors",
      posture:"CONTINUE",
    };
  }
}
