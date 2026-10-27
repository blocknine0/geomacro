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


test("country phrases use longest match without inventing nested countries",()=>{
 assert.equal(countryMentionFromTitle("Guinea-Bissau announces trade measures",COUNTRIES_195),"GNB");
 assert.equal(countryMentionFromTitle("South Sudan inflation changes",COUNTRIES_195),"SSD");
 assert.equal(countryMentionFromTitle("Equatorial Guinea announces copper exploration",COUNTRIES_195),"GNQ");
 assert.equal(countryMentionFromTitle("Papua New Guinea signs mining policy",COUNTRIES_195),"PNG");
 assert.equal(countryMentionFromTitle("Guinea-Bissau and Guinea agree trade changes",COUNTRIES_195),null);
 assert.equal(countryMentionFromTitle("South Sudan and Sudan announce ceasefire",COUNTRIES_195),null);
});
test("uppercase ordinary English words are never treated as ISO3 countries",()=>{
 assert.equal(countryMentionFromTitle("TRADE AND GROWTH ARE IMPORTANT",COUNTRIES_195),null);
 assert.equal(countryMentionFromTitle("CAN THE GLOBAL CENTRAL BANKS COORDINATE",COUNTRIES_195),null);
});
test("national issuer native-language headings can identify a country but not multiple countries",()=>{
 assert.equal(countryMentionFromTitle("বাংলাদেশ মুদ্রাস্ফীতি হালনাগাদ",COUNTRIES_195),"BGD");
 assert.equal(countryMentionFromTitle("भारत में मुद्रास्फीति पर नया फैसला",COUNTRIES_195),"IND");
 assert.equal(countryMentionFromTitle("Россия объявила меры по экспорту",COUNTRIES_195),"RUS");
 assert.equal(countryMentionFromTitle("भारत এবং বাংলাদেশ trade update",COUNTRIES_195),null);
});
