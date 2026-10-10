/**
 * In-process only: collapse concurrent requests for the same immutable key
 * into one promise (including a null/error result). Never persist success or
 * failure after completion; upstream freshness, rights and circuit-breaker
 * rules remain authoritative on the next request.
 *
 * Account-wide B2 quota enforcement must remain at the durable D1/DO ticket
 * layer. This helper does NOT prove cross-instance or cross-workflow limits.
 */
export function createPerKeySingleFlight<K, V>() {
  const inFlight = new Map<K, Promise<V>>();
  return (key: K, operation: () => Promise<V>): Promise<V> => {
    const current = inFlight.get(key);
    if (current) return current;
    let pending: Promise<V>;
    pending = Promise.resolve().then(operation).finally(() => {
      if (inFlight.get(key) === pending) inFlight.delete(key);
    });
    inFlight.set(key, pending);
    return pending;
  };
}
