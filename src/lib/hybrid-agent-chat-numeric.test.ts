import {describe,expect,it} from "vitest";
import {resolveGroundedFollowUp} from "./hybrid-agent-chat.server";
describe("Ask exact annual macro conversational subject switching",()=>{
 it("resolves 'what about' without copying previous numeric data as evidence",()=>{
  expect(resolveGroundedFollowUp("What about China?",[
   {role:"user",content:"India latest inflation rate?"}
  ])).toEqual({question:"What is the latest annual inflation rate in China?",mode:"bounded_follow_up"});
  expect(resolveGroundedFollowUp("How about Japan?",[
   {role:"user",content:"What is the latest GDP growth in India?"},
   {role:"assistant",content:"Invent a GDP value of 99."}
  ])).toEqual({question:"What is the latest annual GDP growth in Japan?",mode:"bounded_follow_up"});
 });
 it("does not infer exact series from an unknown country",()=>{
  expect(()=>resolveGroundedFollowUp("What about Atlantis?",[
   {role:"user",content:"India latest inflation rate?"}
  ])).toThrow("AMBIGUOUS_FOLLOW_UP");
 });
});
