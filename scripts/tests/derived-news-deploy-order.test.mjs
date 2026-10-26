import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const read=path=>readFileSync(path,"utf8");
test("Worker, publisher and health endpoint share one explicit topic-policy revision",()=>{
 const policy=read("scripts/lib/derived-news-readback-policy.mjs");
 const worker=read("workers/control-plane/src/website-derived-intelligence.mjs");
 const index=read("workers/control-plane/src/index.mjs");
 const publisher=read("scripts/ops/publish-website-derived-news.ts");
 const fastlane=read("scripts/ops/publish-original-news-five-minute-fastlane.ts");
 const privateOsint=read("scripts/ops/private-osint-15m-tick.ts");
 const bridge=read("scripts/lib/private-osint-website-bridge.mjs");
 assert.match(policy,/DERIVED_NEWS_TOPIC_POLICY_REVISION\s*=\s*2/u);
 assert.match(worker,/export\s*\{\s*DERIVED_NEWS_TOPIC_POLICY_REVISION\s*\}/u);
 assert.match(worker,/isSafeDerivedNewsReadbackSignal\(s\)/u);
 assert.match(index,/derived_news_topic_policy_revision:\s*DERIVED_NEWS_TOPIC_POLICY_REVISION/u);
 const deploy=read(".github/workflows/deploy-control-plane-d1.yml");
 assert.ok(deploy.includes('"scripts/lib/derived-news-readback-policy.mjs"'));
 assert.match(publisher,/requireDerivedNewsWorkerPolicy/u);
 const preflight=publisher.indexOf("const workerPolicy=await requireDerivedNewsWorkerPolicy");
 const sourceReadCall=publisher.indexOf("readStatelessWebsiteIntelligence(category");
 assert.ok(preflight>=0&&sourceReadCall>preflight,"health policy preflight must execute before source reads");
 assert.match(publisher,/expectedRevision:\s*DERIVED_NEWS_TOPIC_POLICY_REVISION/u);
 const hourlyPreflight=publisher.indexOf("const workerPolicy=await requireDerivedNewsWorkerPolicy");
 const hourlyRead=publisher.indexOf("readStatelessWebsiteIntelligence(category");
 assert.ok(hourlyPreflight>=0&&hourlyRead>hourlyPreflight);
 const fastPreflight=fastlane.indexOf("const workerPolicy=await requireDerivedNewsWorkerPolicy");
 const fastBaseline=fastlane.indexOf("fetchAllDerivedNews(fetch,runAt)");
 const fastSourceRead=fastlane.indexOf("readFiveMinuteNewsFastlane(runAt,20");
 assert.ok(fastPreflight>=0&&fastBaseline>fastPreflight&&fastSourceRead>fastPreflight);
 // Protected private OSINT must not depend on the public journal health.
 // The non-private editorial path still has its current revision preflight.
 const privateGuard=privateOsint.indexOf("const workerPolicy=researchPrivateOnly?null:await requireDerivedNewsWorkerPolicy");
 const privateRead=privateOsint.indexOf("collectPrivateOsint15m({");
 const privateWrite=privateOsint.indexOf("const persisted=await persistPrivateOsintBatch");
 const privateExit=privateOsint.indexOf("if(researchPrivateOnly){",privateWrite);
 const publicPublish=privateOsint.indexOf("const website=await publishPrivateOsintWebsiteSignals");
 assert.ok(privateGuard>=0&&privateRead>privateGuard&&privateWrite>privateRead&&
   privateExit>privateWrite&&publicPublish>privateExit);
 assert.ok(privateOsint.includes("expectedRevision:DERIVED_NEWS_TOPIC_POLICY_REVISION"));
 assert.match(bridge,/isSafeDerivedNewsReadbackSignal\(s\)/u);
});

test("continuity workflow skips a same-push Worker deploy race and resumes only from trusted main deploy completion",()=>{
 const workflow=read(".github/workflows/website-derived-news-continuity.yml");
 const start=workflow.indexOf("  refresh-derived-news:");
 const end=workflow.indexOf("    runs-on:",start);
 assert.ok(start>=0&&end>start);
 const condition=workflow.slice(start,end);
 assert.match(condition,/github\.event\.workflow_run\.path == '\.github\/workflows\/deploy-control-plane-d1\.yml'/u);
 assert.ok(condition.includes("deploy-permanent-public-finds-archive.yml"));
 assert.ok(workflow.includes('workflows: ["Deploy D1 Control Plane", "Deploy Permanent Public Finds Archive"]'));
 assert.match(condition,/github\.event\.workflow_run\.head_repository\.full_name == 'blocknine0\/geomacro'/u);
 assert.match(condition,/github\.event\.workflow_run\.head_branch == 'main'/u);
 assert.doesNotMatch(condition,/workflow_run\.conclusion == 'success'/u);
 assert.match(condition,/github\.event_name != 'push'/u);
 assert.doesNotMatch(condition,/github\.event\.head_commit/u);
 assert.match(workflow,/node scripts\/ops\/verify-derived-news-public-readback\.mjs/u);
 const readback=read("scripts/ops/verify-derived-news-public-readback.mjs");
 assert.match(readback,/isSafeDerivedNewsReadbackSignal\(signal\)/u);
 assert.match(readback,/osint_feed_observed_unverified/u);
});

test("all readback consumers use the same policy instead of rejecting an entire record for a hostname credit",()=>{
 const b2=read("scripts/lib/derived-news-b2-readwrite-backup.mjs");
 const client=read("src/lib/public-derived-news-client.ts");
 const workflow=read(".github/workflows/website-derived-news-continuity.yml");
 const readback=read("scripts/ops/verify-derived-news-public-readback.mjs");
 assert.match(b2,/isSafeDerivedNewsReadbackSignal\(row\)/u);
 assert.match(client,/isSafeDerivedNewsReadbackSignal\(s\)/u);
 assert.match(workflow,/verify-derived-news-public-readback\.mjs/u);
 assert.match(readback,/isSafeDerivedNewsReadbackSignal\(signal\)/u);
 assert.equal([...b2.matchAll(/isSafeDerivedNewsReadbackSignal\(row\)/gu)].length,2);
});

test("both protected-main writers use the same bounded-retry independent public D1 readback",()=>{
 const primary=read(".github/workflows/website-derived-news-continuity.yml");
 const backstop=read(".github/workflows/website-derived-news-cadence-backstop.yml");
 const verifier=read("scripts/ops/verify-derived-news-public-readback.mjs");
 assert.match(primary,/node scripts\/ops\/verify-derived-news-public-readback\.mjs/u);
 assert.match(backstop,/node scripts\/ops\/verify-derived-news-public-readback\.mjs/u);
 assert.match(verifier,/maxAttempts=4/u);
 assert.match(verifier,/RETRYABLE_HTTP/u);
 assert.match(verifier,/DERIVED_NEWS_PUBLIC_READBACK_TRANSPORT_FAILED/u);
 assert.match(primary,/scripts\/tests\/derived-news-public-readback\.test\.mjs/u);
 assert.match(backstop,/scripts\/tests\/derived-news-public-readback\.test\.mjs/u);
 assert.match(verifier,/source_content_logged:false/u);
 assert.match(verifier,/payments_performed:0/u);
});
