#!/usr/bin/env node
/**
 * Outside-in real Chromium rendering and navigation QA for the published
 * public website only. Never sends credentials, submits forms or authorizes
 * transactions. Deployment parity belongs to the independent no-funds gate.
 * No source text or browsing session data leaves the runner.
 */
import {pathToFileURL} from "node:url";
import {resolve} from "node:path";
import {verifyPublishedSourceEquivalence} from "./verify-minimum-free-production-health.mjs";

const ROOT="https://geomacro.live";
const EXPECTED=process.env.GITHUB_SHA??"";
const assert=(ok,code)=>{if(!ok)throw Error(code)};
const timed=ms=>new Promise(r=>setTimeout(r,ms));
const testBrowser=async({chromium,expected=EXPECTED,githubToken=process.env.GITHUB_TOKEN??""}={})=>{
 assert(/^[a-f0-9]{40}$/.test(expected),"BROWSER_EXPECTED_MAIN_SHA_INVALID");
 const browser=await chromium.launch({headless:true,
   args:["--disable-dev-shm-usage","--no-sandbox"]});
 const results=[];
 try{
  const api=await browser.newContext({ignoreHTTPSErrors:false});
  const markerRes=await api.request.get(ROOT+"/.well-known/geomacro-build.json",
   {timeout:20_000,failOnStatusCode:false,headers:{"Cache-Control":"no-cache"}});
  assert(markerRes.status()===200,"BROWSER_BUILD_MARKER_HTTP_UNAVAILABLE");
  const doc=await markerRes.json();
  assert(doc?.schema_version==="geomacro.deployment-build.v1"&&
    doc.canonical_repository==="blocknine0/geomacro"&&
    doc.production_activation_performed===false&&
    /^[a-f0-9]{40}$/.test(doc.canonical_main_sha),"BROWSER_BUILD_MARKER_INVALID");
  const exact=doc.canonical_main_sha===expected;
  const equivalent=!exact&&await verifyPublishedSourceEquivalence(
    doc.canonical_main_sha,expected,{token:githubToken});
  assert(exact||equivalent,"BROWSER_BUILD_SOURCE_PARITY_UNVERIFIED");
  for(const viewport of [{width:1440,height:900},{width:390,height:844}]){
   const page=await api.newPage({viewport,locale:"en-US"});
   const failures=[];
   page.on("pageerror",e=>{if(failures.length<6)failures.push("JS_PAGEERROR")});
   let home;
   try{
    const response=await page.goto(ROOT+"/",
      {waitUntil:"domcontentloaded",timeout:30_000});
    assert(response?.status()===200,"BROWSER_HOMEPAGE_HTTP_UNAVAILABLE");
    await page.locator("main").first().waitFor({state:"visible",timeout:15_000});
    await timed(1800);
    home=await page.evaluate(()=>({
      text:document.body?.innerText??"",
      main:document.querySelector("main")!==null,
      scripts:document.scripts.length,
      links:[...document.querySelectorAll("a[href]")].map(a=>a.getAttribute("href")??""),
      title:document.title,
    }));
    assert(home.main&&home.text.length>180&&/geomacro/i.test(home.title),
      "BROWSER_HOMEPAGE_NOT_RENDERED");
    assert(home.scripts>0,"BROWSER_HOMEPAGE_JS_BUNDLE_MISSING");
    assert(home.links.some(h=>h.startsWith("/intelligence")),
      "BROWSER_INTELLIGENCE_NAV_LINK_MISSING");
    assert(failures.length===0,"BROWSER_HOMEPAGE_JS_EXCEPTION");

    // Exercise a real click where the navigation item is visible. Mobile
    // menu can be collapsed; navigate directly on mobile rather than
    // fabricating a menu-control acceptance.
    if(viewport.width===1440){
      const links=page.locator('a[href^="/intelligence"]:visible');
      assert(await links.count()>0,"BROWSER_DESKTOP_NAV_LINK_HIDDEN");
      await links.first().click({timeout:10_000});
      await page.waitForURL(url=>url.pathname==="/intelligence",{timeout:15_000});
    } else {
      const r=await page.goto(ROOT+"/intelligence",
        {waitUntil:"domcontentloaded",timeout:30_000});
      assert(r?.status()===200,"BROWSER_INTELLIGENCE_HTTP_UNAVAILABLE");
    }
    await page.locator("main").first().waitFor({state:"visible",timeout:15_000});
    await timed(1000);
    const intelligence=await page.evaluate(()=>({
      text:document.body?.innerText??"",
      path:location.pathname,
      title:document.title,
    }));
    assert(intelligence.path==="/intelligence"&&
      /geomacro finds|what changed in the world/i.test(intelligence.text),
      "BROWSER_INTELLIGENCE_NOT_RENDERED");
    assert(failures.length===0,"BROWSER_INTELLIGENCE_JS_EXCEPTION");
    const ask=await page.goto(ROOT+"/ask-geomacro",
      {waitUntil:"domcontentloaded",timeout:30_000});
    assert(ask?.status()===200,"BROWSER_ASK_HTTP_UNAVAILABLE");
    await page.locator("main").first().waitFor({state:"visible",timeout:15_000});
    await timed(900);
    const askScreen=await page.evaluate(()=>({
      text:document.body?.innerText??"",path:location.pathname,
    }));
    assert(askScreen.path==="/ask-geomacro"&&
      /ask geomacro/i.test(askScreen.text),"BROWSER_ASK_NOT_RENDERED");
    assert(failures.length===0,"BROWSER_ASK_JS_EXCEPTION");
    // Full public storefront and editorial navigation surface. These are
    // presentation checks only, NOT proof of paid execution or signed data.
    const publicPages=[
      {path:"/pricing",title:/store|pricing/i},
      {path:"/data-api",title:/api.*agents/i},
      {path:"/docs",title:/documentation/i},
      {path:"/risk-indices",title:/risk indices/i},
    ];
    for(const item of publicPages){
      const response=await page.goto(ROOT+item.path,
        {waitUntil:"domcontentloaded",timeout:30_000});
      assert(response?.status()===200,"BROWSER_PUBLIC_PAGE_HTTP_UNAVAILABLE");
      await page.locator("main").first().waitFor({state:"visible",timeout:15_000});
      await timed(500);
      const state=await page.evaluate(()=>({
        title:document.title,
        path:location.pathname,
        bodyLength:document.body?.innerText?.length??0,
      }));
      assert(state.path===item.path&&item.title.test(state.title)&&state.bodyLength>90,
        "BROWSER_PUBLIC_PAGE_NOT_RENDERED");
      assert(failures.length===0,"BROWSER_PUBLIC_PAGE_JS_EXCEPTION");
    }
    results.push({viewport:viewport.width+"x"+viewport.height,
      home_http_200:true,intelligence_http_200:true,
      ask_http_200:true,public_surfaces_http_200:publicPages.length,
      public_surfaces:publicPages.map(x=>x.path),
      nav_clicked:viewport.width===1440,
      js_page_errors:0,marker_parity:exact?"EXACT_MAIN":"PROVEN_NON_WEBSITE_ONLY"});
   }finally{await page.close()}
  }
  await api.close();
  return {schema:"geomacro.public-browser-qa.v1",ok:true,
    published_sha:doc.canonical_main_sha,expected_main_sha:expected,
    browser:"CHROMIUM_HEADLESS",checks:results,
    signed_product_claimed:false,payment_attempts:0,
    private_credentials_provided:false};
 }finally{await browser.close()}
};
export {testBrowser};
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 try{
  // Installed only in an ephemeral GitHub runner; never shipped to a Worker.
  const modulePath=process.env.GEOMACRO_PLAYWRIGHT_MODULE;
  assert(modulePath?.startsWith("/tmp/geomacro-browser-qa/"),
    "BROWSER_EPHEMERAL_PLAYWRIGHT_PATH_REQUIRED");
  const {chromium}=await import(pathToFileURL(modulePath).href);
  console.log(JSON.stringify(await testBrowser({chromium})));
 }catch(e){
  console.error(e instanceof Error&&/^[A-Z0-9_]+$/.test(e.message)?
   e.message:"BROWSER_QA_UNEXPECTED_FAILURE");
  process.exitCode=2;
 }
}
