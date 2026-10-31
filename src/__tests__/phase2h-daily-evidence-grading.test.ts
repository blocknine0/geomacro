import {describe,it,expect} from "vitest";
import {createHash} from "node:crypto";
import {gradeArchivedPhase2hEvidence} from "../pipelines/evidence-grader";
import {compilePhase2hDailyCountryDigest} from "../../scripts/ops/compile-daily-grounded-digests";
const now=new Date("2026-11-01T00:00:00.000Z");
const sha=(x:string)=>createHash("sha256").update(x).digest("hex");
function makeRow({
 category="macro",title="United States central bank reports inflation of 2.5 percent",
 publication="2026-10-31T20:00:00.000Z",archived=true,
 number=true,articlePage=false,independent=false,
}:{
 category?:string;title?:string;publication?:string;archived?:boolean;
 number?:boolean;articlePage?:boolean;independent?:boolean;
}={}){
 const record_id=sha(category+"\nhttps://www.federalreserve.gov/newsevents/pressreleases/sample.htm\n"+publication);
 const original={
  original_source_id:"fed_board",
  original_url:"https://www.federalreserve.gov/newsevents/pressreleases/sample.htm",
  original_published_at:publication,
  date_precision:"exact",
  original_title:number?title:"United States central bank policy update",
  original_content:null,
  content_scope:"ORIGINAL_FEED_METADATA_ONLY",
  full_article_html_collected:false,original_article_license_verified:false,
  source_credit:null,
 };
 const analysis={
  schema:"geomacro.phase2h.private-five-part.v1",
  what_happened:{text:"The Federal Reserve published its monetary policy update.",
   original_observation_id:record_id},
  why_it_matters:{text:"Policy update affects the documented interest-rate outlook.",
   independently_verified:false},
  market_relevance:{potential_watch_channels:["rates_and_bonds"],
   observed_market_reaction_verified:false,
   confirmed_instruments:[],price_direction:null,price_change:null},
  what_to_watch:{event_topic:"monetary policy",
   trigger:"NEXT_ORIGINAL_RELEASE_OR_INDEPENDENT_CONFIRMATION",
   confirmed_followup_at:null},
  evidence_and_confidence:{
   original_observation_id:record_id,
   source_published_at:publication,date_precision:"exact",
   observed_feed_title_available:true,
   original_article_page_verified:articlePage,
   independent_event_verified:independent,
   commercial_rights_verified:false,paid_eligible:false,
   source_content_identity_sha256:sha(original.original_title+"\n"+publication),
  },
 };
 const root={schema:"geomacro.phase2h.private-raw-observation.v1",
  record_id,category,original,analysis,
  commercial_rights_verified:false,commercial_delivery_authorized:false};
 const raw_sha256=sha(JSON.stringify(root));
 return {
  ...root,raw_sha256,ingested_at:"2026-10-31T20:05:00.000Z",
  raw_json:JSON.stringify({...root,raw_sha256,ingested_at:"2026-10-31T20:05:00.000Z"}),
  b2_object_sha256:archived?sha("real-test-only-b2-object"):null,
  b2_archived_at:archived?"2026-10-31T21:00:00.000Z":null,
  original_published_at:publication,
  first_ingested_at:"2026-10-31T20:05:00.000Z",
 };
}
describe("Phase2H daily archived original grading",()=>{
 it("extracts units, binds exact native clock, country, raw SHA and B2 ack without payable promotion",()=>{
  const result=gradeArchivedPhase2hEvidence(makeRow(),now);
  expect(result.archive_ack_verified).toBe(true);
  expect(result.country_iso3).toBe("USA");
  expect(result.published_utc).toBe("2026-10-31T20:00:00.000Z");
  expect(result.quantified_metrics).toContain("2.5 percent");
  expect(result.grounding_status).toBe("FREE_PUBLIC_NEWS");
  expect(result.confidence_score).toBeLessThan(0.85);
  expect(result.paid_quote_authorized).toBe(false);
 });
 it("never accepts D1 staged-only, changed SHA or date-only as corroborated evidence",()=>{
  const staged=gradeArchivedPhase2hEvidence(makeRow({archived:false}),now);
  expect(staged.archive_ack_verified).toBe(false);
  const altered=makeRow();altered.raw_sha256="0".repeat(64);
  expect(gradeArchivedPhase2hEvidence(altered,now).failure_codes).toContain("IMMUTABLE_RAW_SHA_MISMATCH");
  const dateOnly=makeRow({publication:"2026-10-31"});
  expect(gradeArchivedPhase2hEvidence(dateOnly,now).published_utc).toBeNull();
 });
 it("numeric value absent, ambiguous country and old observations remain nonpayable",()=>{
  expect(gradeArchivedPhase2hEvidence(makeRow({number:false}),now)
   .quantified_metrics).toEqual([]);
  expect(gradeArchivedPhase2hEvidence(makeRow({
   title:"United States and Canada announce 10 percent cross border policy",
  }),now).country_iso3).toBeNull();
  expect(gradeArchivedPhase2hEvidence(makeRow({
   publication:"2026-10-27T10:00:00.000Z",
  }),now).published_utc).toBeNull();
 });
 it("generates canonical 585-cell private digests and no fake GRO/signing/credits",()=>{
  const one=compilePhase2hDailyCountryDigest({now,rows:[makeRow()],fullScan:true});
  expect(one.country_grid_size).toBe(585);
  expect(one.counts.archived_rows_valid).toBe(1);
  expect(one.counts.country_cells_with_archived_observations).toBe(1);
  const usa=one.cells.find(x=>x.country_iso3==="USA"&&x.domain_category==="macro")!;
  expect(usa.status).toBe("NO_PAYABLE_EVIDENCE");
  expect(usa.current_events).toHaveLength(1);
  expect(usa.catalog_price_mutated).toBe(false);
  expect(usa.quote_authorized).toBe(false);
  expect(usa.cryptographic_signature_verified).toBe(false);
  expect(one.paid_delivery_authorized).toBe(false);
  expect(one.payment_attempted).toBe(false);
 });
 it("48h downgrade, 72h cutoff, cap and duplicate fail closed",()=>{
  const old=makeRow({publication:"2026-10-29T18:00:00.000Z"});
  const digest=compilePhase2hDailyCountryDigest({now,rows:[old],fullScan:true});
  const usa=digest.cells.find(x=>x.country_iso3==="USA"&&x.domain_category==="macro")!;
  expect(usa.status).toBe("STALE_BASE_ONLY");
  expect(usa.current_events).toHaveLength(0);
  expect(()=>compilePhase2hDailyCountryDigest({now,rows:[old,old],fullScan:true}))
   .toThrow("DUPLICATE_OR_INVALID_ORIGINAL_ID");
  expect(compilePhase2hDailyCountryDigest({now,rows:[makeRow()],fullScan:false})
   .canonical_d1_scan_complete).toBe(false);
 });
});
