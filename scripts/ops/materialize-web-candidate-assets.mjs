import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';

// Existing owner-controlled public images, independently read and pinned on
// 2026-10-19. Ship exact bytes in ASSETS, without a runtime production proxy.
export const PINNED_ASSETS=[
 {file:'geomacro-logo.png',sha256:'dffcd596bbfb054f45b9e922d94e28292c792922b7ab26055e7e544989eb60df'},
 {file:'network-bg.png',sha256:'efda019d54f38428c2070723a87f12287b1be8d0290fe9163634f986a76548d6'},
];
export async function materializeCandidateAssets({root=process.cwd(),fetchImpl=fetch,pins=PINNED_ASSETS}={}){
 const verified=[];
 for(const pin of pins){
  if(!/^[a-z0-9-]+\.png$/u.test(pin.file)||!/^[a-f0-9]{64}$/u.test(pin.sha256))throw Error('CANDIDATE_ASSET_PIN_INVALID');
  const metadata=JSON.parse(readFileSync(resolve(root,'src/assets',pin.file+'.asset.json'),'utf8'));
  if(metadata.content_type!=='image/png'||!Number.isSafeInteger(metadata.size)||metadata.size<8||metadata.size>1_000_000||
   metadata.url!==`/__l5e/assets-v1/${metadata.asset_id}/${pin.file}`||!/^[a-f0-9-]{36}$/u.test(metadata.asset_id))throw Error('CANDIDATE_ASSET_METADATA_INVALID');
  const response=await fetchImpl('https://geomacro.live'+metadata.url,{redirect:'error',credentials:'omit',headers:{Accept:'image/png'},signal:AbortSignal.timeout(20_000)});
  if(response.status!==200||response.headers.get('content-type')?.split(';')[0]!=='image/png'||!response.body)throw Error('CANDIDATE_ASSET_READ_FAILED');
  const reader=response.body.getReader(),parts=[];let length=0;
  try{while(true){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>metadata.size)throw Error('CANDIDATE_ASSET_SIZE_MISMATCH');parts.push(value)}}
  finally{await reader.cancel()}
  const bytes=Buffer.concat(parts);
  if(bytes.length!==metadata.size||bytes.subarray(0,8).toString('hex')!=='89504e470d0a1a0a'||createHash('sha256').update(bytes).digest('hex')!==pin.sha256)throw Error('CANDIDATE_ASSET_BYTES_MISMATCH');
  verified.push({path:resolve(root,'.output/public','.'+metadata.url),bytes});
 }
 // No partial publication if either image fails verification.
 for(const asset of verified){mkdirSync(dirname(asset.path),{recursive:true});writeFileSync(asset.path,asset.bytes)}
 return {schema:'geomacro.candidate-public-assets.v1',verified_images:verified.length,total_bytes:verified.reduce((n,a)=>n+a.bytes.length,0),runtime_asset_proxy:false,payments:0};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)
 console.log(JSON.stringify(await materializeCandidateAssets()));
