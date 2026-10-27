import {describe,it,expect} from "vitest";
import {readFileSync} from "node:fs";

const homepage=readFileSync("src/components/home/live-intelligence-showcase.tsx","utf8");

describe("homepage source-outage truth, no invented news or current claim",()=>{
 it("continues showing a genuinely dated prior Find with an explicit degraded banner",()=>{
  expect(homepage).toContain('{unavailable ? (');
  expect(homepage).toContain('Latest previously observed finding. New source checks are unavailable; this is not a confirmed current ingestion update.');
  expect(homepage).toContain('role="status" aria-live="polite"');
  expect(homepage).toContain('Source freshness unverified');
  expect(homepage).toContain('winner.originalAt');
  expect(homepage).toContain('winner.isCurrent?"Original release within 24h":"Earlier original release · not current"');
 });
 it("never replaces the previous verified view with a fabricated successful empty response",()=>{
  expect(homepage).toContain('mergeHomepageFindCards(previous,next)');
  expect(homepage).toContain('setUnavailable(true);setChecked(true);');
  expect(homepage).not.toContain('setUnavailable(false);setChecked(true);setCards([])');
  expect(homepage).toContain('selectHomepageFreeFind(visibleCards)');
 });
});
