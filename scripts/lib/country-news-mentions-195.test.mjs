import test from "node:test";
import assert from "node:assert/strict";
import {COUNTRIES_195} from "../../src/lib/canonical-country-registry-195.ts";
import {countryMentionFromTitle} from "./country-news-mentions-195.mjs";

test("exact canonical 195 country title geography, including two observers",()=>{
 assert.equal(COUNTRIES_195.length,195);
 assert.equal(countryMentionFromTitle("India central bank reports inflation",COUNTRIES_195),"IND");
 assert.equal(countryMentionFromTitle("United States announces sanctions",COUNTRIES_195),"USA");
 assert.equal(countryMentionFromTitle("Holy See diplomatic statement",COUNTRIES_195),"VAT");
 assert.equal(countryMentionFromTitle("State of Palestine security announcement",COUNTRIES_195),"PSE");
});
test("cross-border, unmentioned or ambiguous country headlines do not invent a country",()=>{
 assert.equal(countryMentionFromTitle("India and Canada sign mineral trade agreement",COUNTRIES_195),null);
 assert.equal(countryMentionFromTitle("Global monetary policy report",COUNTRIES_195),null);
 assert.equal(countryMentionFromTitle("Republic of the Congo and Democratic Republic of the Congo statement",COUNTRIES_195),null);
 assert.equal(countryMentionFromTitle("Majority of investors seek clarity",COUNTRIES_195),null);
});
test("cannot inject a counterfeit 196th country registry",()=>{
 assert.throws(()=>countryMentionFromTitle("India rate increase",
   [...COUNTRIES_195,{iso3:"ZZZ",name:"Made-up Country",aliases:[]}]),/NEWS_COUNTRY_195_INPUT_INVALID/);
});
