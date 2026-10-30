/**
 * Buyer-selected native-USDC checkout network. A selection is a routing hint,
 * NEVER a statement of commercial eligibility, merchant readiness, or payment.
 * Share one strict parser across natural-language, category and canonical APIs
 * so no alias silently drops Polygon and pays on Base instead.
 */
export type GeomacroCheckoutNetwork="base"|"polygon";
export function selectedCheckoutNetwork(request:Request):GeomacroCheckoutNetwork|null {
  const url=new URL(request.url);
  const networks=url.searchParams.getAll("network");
  if(url.hash||[...url.searchParams.keys()].some(key=>key!=="network")||
     networks.length>1||(networks.length===1&&
       networks[0]!=="base"&&networks[0]!=="polygon"))
    throw Error("MAINNET_NETWORK_QUERY_UNSUPPORTED");
  return networks.length===1?networks[0] as GeomacroCheckoutNetwork:null;
}
export function canonicalCheckoutUrl(request:Request,path="/api/v1/intelligence/query"):URL {
  const network=selectedCheckoutNetwork(request);
  const target=new URL(path,request.url);
  if(network)target.searchParams.set("network",network);
  return target;
}
