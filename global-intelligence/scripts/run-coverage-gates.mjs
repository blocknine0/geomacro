import fs from "node:fs/promises";
const countries=JSON.parse(await fs.readFile(new URL("../country-mesh/countries.v1.json",import.meta.url),"utf8"));
const countryCount=countries.countries?.length ?? 0;
const expected=countryCount*3;
const matrixPath=new URL("../country-mesh/generated/coverage-matrix.v1.json",import.meta.url);
let matrix=null; try{matrix=JSON.parse(await fs.readFile(matrixPath,"utf8"));}catch{}
const errors=[];
if(countryCount<195) errors.push(`country universe must contain at least 195 countries, got ${countryCount}`);
if(!matrix) errors.push("coverage matrix has not been generated");
if(matrix && (matrix.country_count!==countryCount || matrix.category_count!==3 || matrix.cells?.length!==expected)) errors.push(`coverage matrix must contain ${expected} cells for ${countryCount} countries across 3 categories`);
if(errors.length){console.error(errors.join("\n"));process.exit(1);}
console.log(JSON.stringify({gate:"GLOBAL_INTELLIGENCE_V1_STRUCTURAL",status:"PASS",countries:countryCount,categories:3,cells:expected},null,2));