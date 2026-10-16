import {mkdtemp,writeFile,rm,copyFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';
// Actual workerd with an in-memory outbound fixture. No production traffic,
// real tokens, D1/B2 operations or payments; both real app clients are bundled.
const directory=await mkdtemp(join(tmpdir(),'geomacro-workerd-'));
let child:ReturnType<typeof spawn>|undefined;
try{
 const build=await Bun.build({entrypoints:['scripts/tests/fixtures/workerd-d1/entry.ts'],outdir:directory,target:'node',external:['node:crypto'],naming:'entry.js'});
 assert.equal(build.success,true,build.logs.join('\n'));
 await copyFile('scripts/tests/fixtures/workerd-d1/upstream.js',join(directory,'upstream.js'));
 const fixture='upstream.js';
 await writeFile(join(directory,'config.capnp'),`using Workerd = import "/workerd/workerd.capnp";
 const config :Workerd.Config = (
 services = [
 (name="main", worker=(modules=[(name="entry.js",esModule=embed "entry.js")],compatibilityDate="2026-10-16",compatibilityFlags=["nodejs_compat"],globalOutbound="upstream")),
 (name="upstream", worker=(modules=[(name="fixture.js",esModule=embed ${JSON.stringify(fixture)})],compatibilityDate="2026-10-16"))
 ], sockets=[(name="http",address="127.0.0.1:0",http=(),service="main")]);`);
 child=spawn('workerd',['serve',join(directory,'config.capnp'),'--control-fd=1'],{stdio:['ignore','pipe','pipe']});
 let logs='';child.stderr!.on('data',x=>logs+=x.toString());
 const port=await new Promise<number>((done,fail)=>{
  const timer=setTimeout(()=>fail(Error('WORKER_START_TIMEOUT '+logs)),15000);
  let output='';
  child!.on('error',fail);child!.on('exit',code=>{clearTimeout(timer);fail(Error('WORKER_EXIT '+code+' '+logs));});
  child!.stdout!.on('data',chunk=>{output+=chunk.toString();for(const line of output.split('\n')){try{const v=JSON.parse(line);if(v.event==='listen'&&v.port){clearTimeout(timer);done(v.port);return;}}catch{}}});
 });
 const response=await fetch('http://127.0.0.1:'+port,{signal:AbortSignal.timeout(15000)});
 assert.equal(response.status,200,(await response.clone().text())+' '+logs);
 const result=await response.json();
 assert.deepEqual(result,{old_mode_rejected:true,security:{ok:true,schema:'geomacro.central-security-budget.v1',store:'d1',route_class:'api_write',allowed:true,retry_after_seconds:60},finds_status:200,finds_batches:3,redirects_rejected:9,upstream:{requests:11,escaped:0}});
 console.log('WORKERD_D1_SECURITY_FINDS_AND_REDIRECT_ISOLATION_VERIFIED');
}finally{child?.kill();await rm(directory,{recursive:true,force:true});}
