import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";

// Test only the pure original-title country attribution function. Never
// execute the Supabase function's server credentials, cron or network code.
const src=readFileSync(new URL(
 "../../supabase/functions/gm-research-stream20m/index.ts",import.meta.url),"utf8");
const countries=JSON.parse(src.match(
 /const COUNTRIES=(\[.*?\]);\nconst PROJECT=/u)?.[1]??"null");
assert.ok(Array.isArray(countries)&&countries.length===195);
const start=src.indexOf("const HOT50_ORIGINAL_TITLE_ALIASES=");
const end=src.indexOf("\nfunction severity(",start);
assert.ok(start>0&&end>start);
const pure=src.slice(start,end);
// Run the immutable pure source exactly once: a second evaluation in the
// same VM context would redeclare its const binding and falsely fail CI.
const {parse,aliases}=runInNewContext(pure+
 "\n({parse:countryFromTitle,aliases:HOT50_ORIGINAL_TITLE_ALIASES});",
 {COUNTRIES:countries});

test("all owner-selected Hot50 countries get conservative explicit native-title aliases",()=>{
 const hot50=("USA CHN IND RUS GBR DEU FRA JPN KOR BEL CAN AUS BRA MEX ITA ESP "+
  "NLD CHE NOR SWE POL UKR TUR SAU ARE IRN ISR EGY QAT OMN IRQ ZAF NGA COD "+
  "ZMB CHL PER ARG BOL IDN VNM THA MYS SGP PHL PAK BGD KAZ MNG MMR").split(" ");
 assert.equal(hot50.length,50);
 assert.deepEqual(Object.keys(aliases).sort(),hot50.sort());
 for(const entry of Object.values(aliases)){
  assert.ok(Array.isArray(entry)&&entry.length>0);
  assert.ok(entry.every(x=>typeof x==="string"&&x.length>=4));
 }
 assert.ok(!aliases.COD.includes("Congolese"),"R. Congo is a distinct sovereign country");
});

test("original publisher headline adjectives accurately identify single countries",()=>{
 for(const [title,expected] of [
  ["Russian government announces restrictions","RUS"],
  ["Chinese government announces export controls","CHN"],
  ["U.S. Treasury announces new sanctions","USA"],
  ["Indian central bank announces policy rate increase","IND"],
  ["British foreign office announces policy","GBR"],
  ["Saudi cabinet announces new policy","SAU"],
  ["South Korean ministry announces restrictions","KOR"],
  ["DR Congo ministry announces copper export restrictions","COD"],
  ["Filipino authorities announce mine closures","PHL"],
  ["Myanmar ministry announces new measures","MMR"],
  ["The Government of Brazil announces capital controls","BRA"],
 ])assert.equal(parse(title),expected,title);
});

test("reject multiple-country and ambiguous claims rather than picking longer spelling",()=>{
 for(const title of [
  "China announces sanctions on Russia",
  "India and Pakistan announce new restrictions",
  "Russia accuses the United States of new restrictions",
  "Chinese response to Russian sanctions",
  "U.S. and Canadian officials announce agreement",
  "Congolese ministry announces new law", // could refer to either Congo
  "Unspecified central bank announces rate decision",
  "The government asked us to approve a project", // 'us' pronoun
 ])assert.equal(parse(title),null,title);
});

test("boundaries forbid substring country promotion and retain older direct matches",()=>{
 assert.equal(parse("Germanium export restrictions announced"),null);
 assert.equal(parse("British Columbia mining policy announced"),"CAN");
 assert.equal(parse("Australia launches new lithium program"),"AUS");
 assert.equal(parse("Ukraine announces border closure"),"UKR");
 assert.equal(parse("Palestinian government announces a decision"),"PSE");
});
