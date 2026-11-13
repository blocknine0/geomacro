export const PREDGE_0131_DATABASE_ID="db057ca9-6f9e-4957-ac28-144f3b798f9b";
export const PREDGE_0131_DATABASE_NAME="geomacro-control-plane";

export function assertD1DatabaseIdentity(payload,{
 databaseId=PREDGE_0131_DATABASE_ID,
 databaseName=PREDGE_0131_DATABASE_NAME
}={}){
 const result=payload?.result;
 if(payload?.success!==true||!databaseId||!databaseName||
    !result||typeof result!=="object"||Array.isArray(result)||
    result.uuid!==databaseId||result.name!==databaseName){
  throw Error("D1_DATABASE_IDENTITY_MISMATCH");
 }
 return Object.freeze({uuid:result.uuid,name:result.name});
}
