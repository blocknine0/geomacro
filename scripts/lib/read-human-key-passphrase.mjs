// Local human prompt for a passphrase-protected Ed25519 key. TTY only.
// Input echo goes to a muted stream; nothing is cached, stored or sent
// to GitHub Actions, Cloudflare or the website. Not an approval by itself.
import {createInterface} from "node:readline/promises";
import {Writable} from "node:stream";
export async function readHumanKeyPassphrase(prompt){
 if(!process.stdin.isTTY||!process.stdout.isTTY||
   typeof prompt!=="string"||prompt.length>120)
  throw Error("LOCAL_HUMAN_PASSPHRASE_TTY_REQUIRED");
 const sink=new Writable({write(_bytes,_encoding,next){next();}});
 const rl=createInterface({
  input:process.stdin,output:sink,terminal:true,historySize:0
 });
 let value="";
 try{
  process.stdout.write(prompt);
  value=await rl.question("");
 }finally{
  rl.close();
  process.stdout.write("\n");
 }
 if(value.length<12||value.length>256)
  throw Error("LOCAL_HUMAN_KEY_PASSPHRASE_REQUIRED");
 return value;
}
