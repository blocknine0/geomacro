const RULES=[
  {category:"CRITICAL_MINERALS",terms:/critical mineral|lithium|cobalt|nickel|graphite|rare earth|rare-earth|copper|uranium|supply of mineral|mine|refin/i},
  {category:"MACRO",terms:/inflation|gdp|cpi|interest rate|central bank|currency|fx|employment|unemployment|trade|export|import|debt|fiscal|monetary|recession|growth/i},
  {category:"GEOPOLITICS",terms:/war|conflict|sanction|sanctions|tariff|election|government|military|security|diplomatic|treaty|protest|coup|border|shipping|strait|policy/i}
];
export function routeQuestion(question){
  const hits=RULES.filter(r=>r.terms.test(question)).map(r=>r.category);
  return hits.length ? hits : ["GEOPOLITICS","MACRO","CRITICAL_MINERALS"];
}
