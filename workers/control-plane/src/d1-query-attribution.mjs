/** Invocation-local attribution. No SQL, bindings, payloads or D1 telemetry writes. */
export function attributeD1(db, emit = row => console.log(JSON.stringify(row))) {
  const statements = new WeakMap(), totals = new Map();
  async function record(sql, result, failed = false) {
    const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(sql));
    const fingerprint = Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('');
    // Query text is hashed locally, never emitted. Dynamic SQL shapes remain distinct.
    if (!totals.has(fingerprint) && totals.size >= 128) flush();
    const row = totals.get(fingerprint) ?? {fingerprint, calls:0, rows_read:0, rows_written:0, unknown:0, errors:0};
    row.calls++;
    if (failed) row.errors++;
    const m = result?.meta;
    if (Number.isSafeInteger(m?.rows_read) && m.rows_read >= 0 &&
        Number.isSafeInteger(m?.rows_written) && m.rows_written >= 0) {
      row.rows_read += m.rows_read; row.rows_written += m.rows_written;
    } else row.unknown++;
    totals.set(fingerprint, row);
  }
  async function observe(sql, action) {
    let result;
    try { result = await action(); }
    catch (error) { try { await record(sql, null, true); } catch {} throw error; }
    try { await record(sql, result); } catch {} // Telemetry cannot change query success.
    return result;
  }
  function wrap(native, sql) {
    const proxy = new Proxy(native, {get(target, key) {
      if (key === 'bind') return (...args) => wrap(target.bind(...args), sql);
      if (key === 'first') return async column => {
        const result = await observe(sql, () => target.all());
        const row = result.results?.[0];
        if (!row) return null;
        if (column === undefined) return row;
        if (!Object.hasOwn(row,column)) throw Error('D1_COLUMN_NOTFOUND: Column not found');
        return row[column];
      };
      if (['all','run','raw'].includes(key))
        return (...args) => observe(sql, () => target[key](...args));
      const value = Reflect.get(target, key, target);
      return typeof value === 'function' ? value.bind(target) : value;
    }});
    statements.set(proxy, {native, sql}); return proxy;
  }
  const wrapped = new Proxy(db, {get(target, key) {
    if (key === 'prepare') return sql => wrap(target.prepare(sql), sql);
    if (key === 'batch') return async list => {
      const entries = list.map(s => statements.get(s));
      let results;
      try { results = await target.batch(list.map((s,i) => entries[i]?.native ?? s)); }
      catch (error) {
        await Promise.all(entries.map(e => e ? record(e.sql,null,true).catch(()=>{}) : null));
        throw error;
      }
      await Promise.all(entries.map((e,i) => e ? record(e.sql,results?.[i]).catch(()=>{}) : null));
      return results;
    };
    const value = Reflect.get(target,key,target);
    return typeof value === 'function' ? value.bind(target) : value;
  }});
  function flush() {
    for (const row of totals.values()) {
      try { emit({schema:'geomacro.d1-query-attribution.v1', ...row,
        scope:'worker-invocation', account_budget_proof:false}); } catch {}
    }
    totals.clear();
  }
  return {db:wrapped, flush};
}
