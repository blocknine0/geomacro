import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const read=path=>readFileSync(path,"utf8");
test("Worker, publisher and health endpoint share one explicit topic-policy revision",()=>{
 const policy=read("scripts/lib/derived-news-readback-policy.mjs");
 const worker=read("workers/control-plane/src/website-derived-intelligence.mjs");
 const index=read("workers/control-plane/src/index.mjs");
 const publisher=read("scripts/ops/publish-website-derived-news.ts");
 assert.match(policy,/DERIVED_NEWS_TOPIC_POLICY_REVISION\s*=\s*2/u);
 assert.match(worker,/export\s*\{\s*DERIVED_NEWS_TOPIC_POLICY_REVISION\s*\}/u);
 assert.match(worker,/isSafeDerivedNewsReadbackSignal\(s\)/u);
 assert.match(index,/derived_news_topic_policy_revision:\s*DERIVED_NEWS_TOPIC_POLICY_REVISION/u);
 const deploy=read(".github/workflows/deploy-control-plane-d1.yml");
 assert.ok(deploy.includes('"scripts/lib/derived-news-readback-policy.mjs"'));
 assert.match(publisher,/requireDerivedNewsWorkerPolicy/u);
 const preflight=publisher.indexOf("const workerPolicy=await requireDerivedNewsWorkerPolicy");
 const read=publisher.indexOf("readStatelessWebsiteIntelligence(category");
 assert.ok(preflight>=0&&read>preflight,"health policy preflight must execute before source reads");
 assert.match(publisher,/expectedRevision:\s*DERIVED_NEWS_TOPIC_POLICY_REVISION/u);
});

test("continuity workflow skips a same-push Worker deploy race and resumes only from trusted main deploy completion",()=>{
 const workflow=read(".github/workflows/website-derived-news-continuity.yml");
 const start=workflow.indexOf("  refresh-derived-news:");
 const end=workflow.indexOf("    runs-on:",start);
 assert.ok(start>=0&&end>start);
 const condition=workflow.slice(start,end);
 assert.match(condition,/github\.event\.workflow_run\.path == '\.github\/workflows\/deploy-control-plane-d1\.yml'/u);
 assert.match(condition,/github\.event\.workflow_run\.head_repository\.full_name == 'blocknine0\/geomacro'/u);
 assert.match(condition,/github\.event\.workflow_run\.head_branch == 'main'/u);
 assert.doesNotMatch(condition,/workflow_run\.conclusion == 'success'/u);
 assert.match(condition,/contains\(github\.event\.head_commit\.modified, 'workers\/control-plane\/src\/website-derived-intelligence\.mjs'\)/u);
 assert.match(condition,/contains\(github\.event\.head_commit\.modified, 'workers\/control-plane\/src\/index\.mjs'\)/u);
 assert.match(workflow,/isSafeDerivedNewsReadbackSignal\(s\)/u);
 assert.match(workflow,/osint_feed_observed_unverified/u);
});

test("all readback consumers use the same policy instead of rejecting an entire record for a hostname credit",()=>{
 const b2=read("scripts/lib/derived-news-b2-readwrite-backup.mjs");
 const client=read("src/lib/public-derived-news-client.ts");
 const workflow=read(".github/workflows/website-derived-news-continuity.yml");
 assert.match(b2,/isSafeDerivedNewsReadbackSignal\(row\)/u);
 assert.match(client,/isSafeDerivedNewsReadbackSignal\(s\)/u);
 assert.match(workflow,/isSafeDerivedNewsReadbackSignal\(s\)/u);
 assert.equal([...b2.matchAll(/isSafeDerivedNewsReadbackSignal\(row\)/gu)].length,2);
});
