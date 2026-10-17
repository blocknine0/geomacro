/**
 * Pure native-Circle-USDC identifiers shared by the public discovery and
 * isolated Durable Object prequote validator; NO merchant activation implied.
 * Neither third-party licences nor real settlement are certified here.
 */
export const GEOMACRO_USDC_NATIVE_RAILS=Object.freeze({
  base:Object.freeze({
    id:"base",name:"Base",chain_id:8453,caip2:"eip155:8453",
    asset:"0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    asset_symbol:"USDC",decimals:6,facilitator:"circle_facilitator_service",
  }),
  arc:Object.freeze({
    id:"arc",name:"Arc",chain_id:5042,caip2:"eip155:5042",
    asset:"0x3600000000000000000000000000000000000000",
    asset_symbol:"USDC",decimals:6,facilitator:"circle_facilitator_service",
  }),
  polygon:Object.freeze({
    id:"polygon",name:"Polygon PoS",chain_id:137,caip2:"eip155:137",
    asset:"0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
    asset_symbol:"USDC",decimals:6,facilitator:"circle_facilitator_service",
  }),
} as const);

export type GeomacroUsdcNetwork=keyof typeof GEOMACRO_USDC_NATIVE_RAILS;
export function exactGeomacroUsdcRail(network:string,asset:string){
  if(typeof network!=="string"||typeof asset!=="string")return null;
  const rail=Object.values(GEOMACRO_USDC_NATIVE_RAILS)
    .find(item=>item.caip2===network&&item.asset.toLowerCase()===asset.toLowerCase());
  return rail??null;
}
