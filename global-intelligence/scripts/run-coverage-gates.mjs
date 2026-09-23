import fs from "node:fs/promises";
const countries=JSON.parse(await fs.readFile(new URL("../country-mesh/countries.v1.json",import.meta.url)));
const expected=195*3;
const matrixPath=new URL("../country-mesh/generated/coverage-matrix.v1.json",import.meta.url);
let matrix=null;
try { matrix=JSON.parse(await fs.readFile(matrixPath)); } catch {}
const errors=[];
if(countries.countries?.length!==195) errors.push("canonical country registry is not 195");
if(!matrix) errors.push("coverage matrix has not been generated");
if(matrix && matrix.cells?.length!==expected) errors.push(`coverage matrix must contain ${expected} cells`);
if(errors.length){console.error(errors.join("\n"));process.exit(1);}
console.log(JSON.stringify({gate:"GLOBAL_INTELLIGENCE_V1_STRUCTURAL",status:"PASS",countries:195,categories:3,cells:expected},null,2));
