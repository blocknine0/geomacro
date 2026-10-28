import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

test("real browser QA is outside-in and cannot use payment or private APIs",()=>{
 const s=readFileSync("scripts/ops/verify-website-real-browser.mjs","utf8");
 assert.ok(s.includes("chromium.launch"));
 assert.ok(s.includes('ROOT+"/.well-known/geomacro-build.json"'));
 assert.ok(s.includes("verifyPublishedSourceEquivalence"));
 assert.ok(s.includes("EXACT_MAIN"));
 assert.ok(s.includes('page.goto(ROOT+"/"'));
 assert.ok(s.includes('page.getByRole("button",{name:"Open navigation menu"})'));
 assert.ok(s.includes('page.getByRole("navigation",{name:"Mobile navigation"})'));
 assert.ok(s.includes('nav.locator(\'a[href^="/intelligence"]:visible\')'));
 assert.ok(s.includes('await trigger.click({timeout:10_000})'));
 assert.ok(s.includes('await links.first().click({timeout:10_000})'));
 assert.ok(s.includes('await page.waitForURL(url=>url.pathname==="/intelligence"'));
 assert.ok(s.includes("nav_clicked:true"));
 assert.equal(s.includes('page.goto(ROOT+"/intelligence"'),false);
 assert.ok(s.includes('page.goto(ROOT+"/ask-geomacro"'));
 for(const route of ["/pricing","/data-api","/docs","/risk-indices"])
  assert.ok(s.includes(`path:"${route}"`),route);
 assert.ok(s.includes('a[href^="/intelligence"]:visible'));
 assert.ok(s.includes("js_page_errors:0"));
 assert.ok(s.includes("payment_attempts:0"));
 assert.ok(s.includes("private_credentials_provided:false"));
 assert.equal(/page\.request\.(?:post|put|delete|patch)\(/u.test(s),false);
 assert.equal(/\.fill\(|\.press\(|\.submit\(/u.test(s),false);
});
test("browser QA executes only after public free-site proof and only for approved main triggers",()=>{
 const y=readFileSync(".github/workflows/minimum-free-derived-production-health.yml","utf8");
 assert.ok(y.includes("independent-real-browser:"));
 assert.ok(y.includes("needs: public-free-site"));
 assert.ok(y.includes("github.ref == 'refs/heads/main'"));
 assert.ok(y.includes("github.event.schedule == '49 2 * * *'"));
 assert.ok(y.includes("playwright@1.56.1"));
 assert.ok(y.includes("GEOMACRO_PLAYWRIGHT_MODULE: /tmp/geomacro-browser-qa/node_modules/playwright/index.mjs"));
 assert.equal(y.includes("skip-browser-security"),false);
});
