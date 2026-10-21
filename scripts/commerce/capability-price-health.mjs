// GET describes the pricing policy. The exact query-specific amount comes
// from the free availability check and the corresponding unpaid 402.
export function assertCapabilityPriceHealth(metadata, availability, requirement) {
  const exact = availability?.exact_price;
  if (metadata?.pricing_policy !== 'SERVER_VERIFIED_CAPABILITY_AND_VARIANT' ||
      metadata?.exact_price_usdc !== null)
    throw Error('CAPABILITY_PRICING_DISCOVERY_POLICY_MISMATCH');
  if (availability?.ok !== true || availability?.chargeable !== true ||
      availability?.payment_required_now !== false ||
      availability?.availability?.deliverable !== true)
    throw Error('CAPABILITY_PRICING_AVAILABILITY_UNVERIFIED');
  if (typeof exact?.amount_usdc !== 'string' ||
      !/^(?:0|[1-9]\d*)(?:\.\d{1,6})?$/.test(exact.amount_usdc))
    throw Error('CAPABILITY_PRICING_DECIMAL_INVALID');
  const [whole, fraction = ''] = exact.amount_usdc.split('.');
  const atomic = (BigInt(whole) * 1_000_000n + BigInt(fraction.padEnd(6, '0'))).toString();
  if (BigInt(atomic) <= 0n || exact.amount_atomic !== atomic || requirement?.amount !== atomic)
    throw Error('CAPABILITY_PRICING_QUERY_AMOUNT_MISMATCH');
  if (exact.asset !== 'USDC' || exact.network !== requirement?.network ||
      typeof exact.asset_contract !== 'string' || typeof requirement?.asset !== 'string' ||
      exact.asset_contract.toLowerCase() !== requirement.asset.toLowerCase())
    throw Error('CAPABILITY_PRICING_QUERY_RAIL_MISMATCH');
  return atomic;
}
