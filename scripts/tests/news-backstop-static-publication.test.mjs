import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
test("quota-admitted :22/:52 D1 recovery must also publish actual static archive",()=>{
 const workflow=readFileSync(".github/workflows/website-derived-news-cadence-backstop.yml","utf8");
 const d1=workflow.slice(workflow.indexOf("  catch-up-derived-only:"));
 const stage=workflow.slice(workflow.indexOf("  publish-recovered-website-archive:"),
     workflow.indexOf("  catch-up-derived-only:"));
 assert.match(d1,/id: decide/);
 assert.match(d1,/needs: quota-admission/);
 assert.match(d1,/needs\.quota-admission\.outputs\.research == 'true'/);
 assert.match(d1,/permanent-archive-candidates\.json/);
 assert.match(d1,/retention-days: 1/);
 assert.match(stage,/needs\.catch-up-derived-only\.result == 'success'/);
 assert.match(stage,/needs\.catch-up-derived-only\.outputs\.recovered_batch == 'true'/);
 assert.match(stage,/group: geomacro-permanent-news-publication/);
 assert.match(stage,/actions\/download-artifact@9000827ccba6bdab643e8b6fd33ac0654aef8333/);
 assert.match(stage,/scripts\/ops\/publish-permanent-derived-news-archive\.mjs/);
 assert.match(stage,/workers\/public-finds-archive/);
 assert.match(stage,/scripts\/ops\/verify-hourly-public-archive-cohort\.mjs/);
 assert.match(stage,/cancel-in-progress: false/);
 assert.match(stage,/environment: production/);
 assert.match(stage,/github\.ref == 'refs\/heads\/main'/);
 assert.equal((workflow.match(/cron: "/g)||[]).length,1);
});
