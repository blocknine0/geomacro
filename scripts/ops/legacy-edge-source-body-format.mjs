// Supabase Management API deployed source bodies can be a zip, JSON file list,
// or literal TypeScript/JavaScript. Preserve exact original body bytes;
// classify without exposing any source content, names or secrets.
const isFiles=files=>Array.isArray(files)&&files.length>0&&files.length<50&&files.every(f=>
 typeof f?.name==="string"&&f.name.length>0&&f.name.length<=250&&
 typeof f?.content==="string"&&f.content.length>20&&f.content.length<2_000_000);
const extensions=["text/","application/javascript","application/typescript","application/x-javascript","application/octet-stream","application/json"];
export function classifyDeployedSourceBody(input,contentType="") {
 const b=Buffer.isBuffer(input)?input:Buffer.from(input??"");
 const mime=String(contentType).split(";")[0].trim().toLowerCase();
 if(b.length<25||b.length>3_000_000)return {kind:"UNEXPECTED_SIZE",restorable:false};
 if(b.subarray(0,4).equals(Buffer.from("504b0304","hex")))
   return {kind:"ZIP_ARCHIVE",restorable:true};
 let text;
 try{text=new TextDecoder("utf-8",{fatal:true}).decode(b)}catch{
  return {kind:"NON_UTF8_NON_ZIP",restorable:false}
 }
 try{
  const obj=JSON.parse(text);
  if(isFiles(Array.isArray(obj)?obj:obj?.files))
   return {kind:"JSON_FILE_LIST",restorable:true};
  if(typeof obj?.content==="string"&&obj.content.length>20&&
     obj.content.length<2_000_000&&typeof obj?.name==="string")
   return {kind:"JSON_SINGLE_FILE",restorable:true};
  return {kind:"OTHER_JSON_RESPONSE",restorable:false};
 }catch{/* Can be raw TypeScript source. */}
 if(!extensions.some(v=>mime===v||mime.startsWith(v)))
   return {kind:"UNEXPECTED_MEDIA_TYPE",restorable:false};
 if(/^\s*<!doctype\s+html|^\s*<html\b/i.test(text))
   return {kind:"HTML_RESPONSE",restorable:false};
 const sourceHint=/(?:\bDeno\s*\.\s*serve\s*\(|\bimport\s+(?:\{|["']|\w)|\bexport\s+(?:default|const|function|\{)|\bserve\s*\(|\baddEventListener\s*\()/m;
 if(sourceHint.test(text)&&!text.includes("\u0000"))
   return {kind:"RAW_JAVASCRIPT_TYPESCRIPT",restorable:true};
 return {kind:"UNKNOWN_TEXT_BODY",restorable:false};
}
