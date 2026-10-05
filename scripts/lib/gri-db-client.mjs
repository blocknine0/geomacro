import { execFileSync } from "node:child_process";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

const PROJECT = "ldpwajisioljyjtojvfx";
const IDENT = /^[a-z_][a-z0-9_]*$/i;
const MAX_BUFFER = 64 * 1024 * 1024;

function identifier(value, label = "identifier") {
  const raw = String(value ?? "").trim();
  if (!IDENT.test(raw)) throw new Error(`INVALID_${label.toUpperCase()}:${raw}`);
  return `"${raw}"`;
}

function parseColumns(value) {
  const raw = String(value ?? "*").trim();
  if (raw === "*") return "*";
  const cols = raw.split(",").map((part) => part.trim()).filter(Boolean);
  if (!cols.length) throw new Error("EMPTY_SELECT_COLUMN_LIST");
  return cols.map((col) => identifier(col, "column")).join(",");
}

function quoteString(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function sqlValue(value) {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("NON_FINITE_SQL_NUMBER");
    return String(value);
  }
  if (Array.isArray(value) || typeof value === "object") {
    return quoteString(JSON.stringify(value));
  }
  return quoteString(value);
}

function validateDbUrl(raw) {
  const dbUrl = String(raw ?? "").trim();
  if (!dbUrl) throw new Error("SUPABASE_DB_URL is required for direct Postgres GRI mode");
  let parsed;
  try {
    parsed = new URL(dbUrl);
  } catch {
    throw new Error("SUPABASE_DB_URL must be a valid PostgreSQL URL");
  }
  if (!["postgres:", "postgresql:"].includes(parsed.protocol)) {
    throw new Error("SUPABASE_DB_URL must use postgres/postgresql");
  }
  if (!parsed.password || parsed.pathname !== "/postgres") {
    throw new Error("Invalid production database target");
  }
  const direct = parsed.hostname === `db.${PROJECT}.supabase.co` && parsed.username === "postgres";
  const pooler = parsed.hostname.endsWith(".pooler.supabase.com") && parsed.username === `postgres.${PROJECT}`;
  if (!direct && !pooler) {
    throw new Error("Refusing direct GRI access outside the authoritative Supabase project");
  }
  return dbUrl;
}

function psql(dbUrl, sql) {
  return execFileSync(
    "psql",
    [dbUrl, "-X", "-qAt", "-v", "ON_ERROR_STOP=1"],
    {
      input: `${sql.trim()}\n`,
      encoding: "utf8",
      maxBuffer: MAX_BUFFER,
      stdio: ["pipe", "pipe", "pipe"],
    },
  );
}

function jsonRows(stdout) {
  return String(stdout ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function normalizedError(error) {
  const stderr = String(error?.stderr ?? "").trim();
  return {
    message: stderr || String(error?.message ?? error),
    code: null,
    details: null,
    hint: null,
  };
}

class DirectQueryBuilder {
  constructor(dbUrl, table) {
    this.dbUrl = dbUrl;
    this.table = String(table ?? "").trim();
    identifier(this.table, "table");
    this.operation = "select";
    this.columns = "*";
    this.selectOptions = {};
    this.returningColumns = null;
    this.payload = null;
    this.upsertOptions = null;
    this.filters = [];
    this.orders = [];
    this.offset = null;
    this.rowLimit = null;
    this.cardinality = "many";
  }

  select(columns = "*", options = {}) {
    if (["insert", "update", "upsert"].includes(this.operation)) {
      this.returningColumns = parseColumns(columns);
    } else {
      this.columns = parseColumns(columns);
      this.selectOptions = options && typeof options === "object" ? options : {};
    }
    return this;
  }

  insert(payload) {
    this.operation = "insert";
    this.payload = Array.isArray(payload) ? payload : [payload];
    if (!this.payload.length) throw new Error("EMPTY_INSERT_PAYLOAD");
    return this;
  }

  upsert(payload, options = {}) {
    this.operation = "upsert";
    this.payload = Array.isArray(payload) ? payload : [payload];
    if (!this.payload.length) throw new Error("EMPTY_UPSERT_PAYLOAD");
    this.upsertOptions = options && typeof options === "object" ? options : {};
    return this;
  }

  update(payload) {
    if (!payload || Array.isArray(payload) || typeof payload !== "object") {
      throw new Error("INVALID_UPDATE_PAYLOAD");
    }
    this.operation = "update";
    this.payload = payload;
    return this;
  }

  eq(column, value) { return this.#filter(column, "=", value); }
  neq(column, value) { return this.#filter(column, "<>", value); }
  gt(column, value) { return this.#filter(column, ">", value); }
  gte(column, value) { return this.#filter(column, ">=", value); }
  lt(column, value) { return this.#filter(column, "<", value); }
  lte(column, value) { return this.#filter(column, "<=", value); }

  in(column, values) {
    identifier(column, "filter_column");
    if (!Array.isArray(values)) throw new Error("IN_FILTER_REQUIRES_ARRAY");
    if (!values.length) {
      this.filters.push("FALSE");
    } else {
      this.filters.push(`${identifier(column)} IN (${values.map(sqlValue).join(",")})`);
    }
    return this;
  }

  is(column, value) {
    identifier(column, "filter_column");
    if (value === null) this.filters.push(`${identifier(column)} IS NULL`);
    else if (value === true) this.filters.push(`${identifier(column)} IS TRUE`);
    else if (value === false) this.filters.push(`${identifier(column)} IS FALSE`);
    else throw new Error("DIRECT_POSTGRES_IS_SUPPORTS_ONLY_NULL_OR_BOOLEAN");
    return this;
  }

  not(column, operator, value) {
    identifier(column, "filter_column");
    if (String(operator).toLowerCase() === "is" && value === null) {
      this.filters.push(`${identifier(column)} IS NOT NULL`);
      return this;
    }
    throw new Error(`UNSUPPORTED_DIRECT_POSTGRES_NOT_OPERATOR:${operator}`);
  }

  filter(column, operator, value) {
    identifier(column, "filter_column");
    const op = String(operator ?? "").trim().toLowerCase();
    if (op === "cs" || op === "not.cs") {
      let parsed = value;
      if (typeof value === "string") {
        try {
          parsed = JSON.parse(value);
        } catch {
          throw new Error("DIRECT_POSTGRES_CS_FILTER_REQUIRES_JSON");
        }
      }
      if (parsed === null || typeof parsed !== "object") {
        throw new Error("DIRECT_POSTGRES_CS_FILTER_REQUIRES_JSON");
      }
      const predicate = `${identifier(column)} @> ${quoteString(JSON.stringify(parsed))}::jsonb`;
      this.filters.push(op === "not.cs" ? `NOT (${predicate})` : predicate);
      return this;
    }
    throw new Error(`UNSUPPORTED_DIRECT_POSTGRES_FILTER_OPERATOR:${operator}`);
  }

  order(column, options = {}) {
    identifier(column, "order_column");
    this.orders.push(`${identifier(column)} ${options?.ascending === false ? "DESC" : "ASC"}`);
    return this;
  }

  range(from, to) {
    const start = Number(from);
    const end = Number(to);
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start) {
      throw new Error("INVALID_RANGE");
    }
    this.offset = start;
    this.rowLimit = end - start + 1;
    return this;
  }

  limit(value) {
    const limit = Number(value);
    if (!Number.isInteger(limit) || limit < 0) throw new Error("INVALID_LIMIT");
    this.rowLimit = limit;
    return this;
  }

  maybeSingle() {
    this.cardinality = "maybe_single";
    return this.#execute();
  }

  single() {
    this.cardinality = "single";
    return this.#execute();
  }

  then(resolve, reject) {
    return this.#execute().then(resolve, reject);
  }

  catch(reject) {
    return this.#execute().catch(reject);
  }

  #filter(column, operator, value) {
    identifier(column, "filter_column");
    if (value === null) {
      if (operator === "=") this.filters.push(`${identifier(column)} IS NULL`);
      else if (operator === "<>") this.filters.push(`${identifier(column)} IS NOT NULL`);
      else throw new Error("NULL_FILTER_ONLY_SUPPORTS_EQ_NEQ");
    } else {
      this.filters.push(`${identifier(column)} ${operator} ${sqlValue(value)}`);
    }
    return this;
  }

  #where() {
    return this.filters.length ? ` WHERE ${this.filters.join(" AND ")}` : "";
  }

  #tail() {
    const order = this.orders.length ? ` ORDER BY ${this.orders.join(",")}` : "";
    const limit = this.rowLimit === null ? "" : ` LIMIT ${this.rowLimit}`;
    const offset = this.offset === null ? "" : ` OFFSET ${this.offset}`;
    return `${order}${limit}${offset}`;
  }

  #selectSql() {
    const table = `public.${identifier(this.table)}`;
    return `SELECT row_to_json(q)::text FROM (SELECT ${this.columns} FROM ${table}${this.#where()}${this.#tail()}) q;`;
  }

  #countSql() {
    const table = `public.${identifier(this.table)}`;
    return `SELECT json_build_object('count', count(*))::text FROM ${table}${this.#where()};`;
  }

  #insertParts() {
    const rows = this.payload;
    const keys = [...new Set(rows.flatMap((row) => Object.keys(row ?? {})))];
    if (!keys.length) throw new Error("INSERT_PAYLOAD_HAS_NO_COLUMNS");
    keys.forEach((key) => identifier(key, "insert_column"));
    const table = `public.${identifier(this.table)}`;
    const cols = keys.map((key) => identifier(key)).join(",");
    const payloadJson = quoteString(JSON.stringify(rows));
    const sourceCols = keys.map((key) => identifier(key)).join(",");
    const insert = `INSERT INTO ${table} (${cols}) SELECT ${sourceCols} FROM jsonb_populate_recordset(NULL::${table}, ${payloadJson}::jsonb)`;
    return { table, keys, insert };
  }

  #insertSql() {
    const { insert } = this.#insertParts();
    if (!this.returningColumns) return `${insert};`;
    return `WITH changed AS (${insert} RETURNING *) SELECT row_to_json(q)::text FROM (SELECT ${this.returningColumns} FROM changed) q;`;
  }

  #upsertSql() {
    const { keys, insert } = this.#insertParts();
    const rawConflict = String(this.upsertOptions?.onConflict ?? "").trim();
    const conflictKeys = rawConflict.split(",").map((part) => part.trim()).filter(Boolean);
    if (!conflictKeys.length) throw new Error("DIRECT_POSTGRES_UPSERT_REQUIRES_ON_CONFLICT");
    conflictKeys.forEach((key) => identifier(key, "upsert_conflict_column"));
    const conflictSql = conflictKeys.map((key) => identifier(key)).join(",");
    const ignoreDuplicates = this.upsertOptions?.ignoreDuplicates === true;
    const updateKeys = keys.filter((key) => !conflictKeys.includes(key));
    const action = ignoreDuplicates || updateKeys.length === 0
      ? "DO NOTHING"
      : `DO UPDATE SET ${updateKeys.map((key) => `${identifier(key)} = EXCLUDED.${identifier(key)}`).join(",")}`;
    const upsert = `${insert} ON CONFLICT (${conflictSql}) ${action}`;
    if (!this.returningColumns) return `${upsert};`;
    return `WITH changed AS (${upsert} RETURNING *) SELECT row_to_json(q)::text FROM (SELECT ${this.returningColumns} FROM changed) q;`;
  }

  #updateSql() {
    const keys = Object.keys(this.payload ?? {});
    if (!keys.length) throw new Error("UPDATE_PAYLOAD_HAS_NO_COLUMNS");
    keys.forEach((key) => identifier(key, "update_column"));
    const table = `public.${identifier(this.table)}`;
    const payloadJson = quoteString(JSON.stringify(this.payload));
    const assignments = keys
      .map((key) => `${identifier(key)} = (jsonb_populate_record(NULL::${table}, ${payloadJson}::jsonb)).${identifier(key)}`)
      .join(",");
    const update = `UPDATE ${table} SET ${assignments}${this.#where()}`;
    if (!this.returningColumns) return `${update};`;
    return `WITH changed AS (${update} RETURNING *) SELECT row_to_json(q)::text FROM (SELECT ${this.returningColumns} FROM changed) q;`;
  }

  async #execute() {
    try {
      let stdout = "";
      let count = null;
      const wantsCount = this.operation === "select" && String(this.selectOptions?.count ?? "").toLowerCase() === "exact";
      const headOnly = this.operation === "select" && this.selectOptions?.head === true;

      if (wantsCount) {
        const countRows = jsonRows(psql(this.dbUrl, this.#countSql()));
        count = Number(countRows[0]?.count ?? 0);
      }

      if (this.operation === "select") {
        if (!headOnly) stdout = psql(this.dbUrl, this.#selectSql());
      } else if (this.operation === "insert") {
        stdout = psql(this.dbUrl, this.#insertSql());
      } else if (this.operation === "upsert") {
        stdout = psql(this.dbUrl, this.#upsertSql());
      } else if (this.operation === "update") {
        stdout = psql(this.dbUrl, this.#updateSql());
      } else {
        throw new Error(`UNSUPPORTED_DIRECT_POSTGRES_OPERATION:${this.operation}`);
      }

      const rows = !headOnly && (this.operation === "select" || this.returningColumns) ? jsonRows(stdout) : [];
      if (this.cardinality === "single") {
        if (rows.length !== 1) {
          return { data: null, count, error: { message: `JSON object requested, multiple (or no) rows returned: ${rows.length}`, code: "PGRST116" } };
        }
        return { data: rows[0], count, error: null };
      }
      if (this.cardinality === "maybe_single") {
        if (rows.length > 1) {
          return { data: null, count, error: { message: `JSON object requested, multiple rows returned: ${rows.length}`, code: "PGRST116" } };
        }
        return { data: rows[0] ?? null, count, error: null };
      }
      return {
        data: headOnly ? null : (this.operation === "select" || this.returningColumns ? rows : null),
        count,
        error: null,
      };
    } catch (error) {
      return { data: null, count: null, error: normalizedError(error) };
    }
  }
}

class DirectPostgresClient {
  constructor(dbUrl) {
    this.dbUrl = validateDbUrl(dbUrl);
  }

  from(table) {
    return new DirectQueryBuilder(this.dbUrl, table);
  }

  async rpc(name, args = {}) {
    try {
      identifier(name, "rpc");
      const entries = Object.entries(args ?? {});
      const namedArgs = entries
        .map(([key, value]) => `${identifier(key, "rpc_argument").slice(1, -1)} => ${sqlValue(value)}`)
        .join(",");
      const sql = `SELECT to_jsonb(public.${identifier(name)}(${namedArgs}))::text;`;
      const rows = jsonRows(psql(this.dbUrl, sql));
      return { data: rows[0] ?? null, error: null };
    } catch (error) {
      return { data: null, error: normalizedError(error) };
    }
  }
}

export function directPostgresMode() {
  return String(process.env.GRI_DB_MODE ?? "").trim().toLowerCase() === "direct_postgres";
}

export function createGriDbClient() {
  if (directPostgresMode()) {
    return new DirectPostgresClient(process.env.SUPABASE_DB_URL);
  }

  const url = process.env.SUPABASE_URL || process.env.APP_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.APP_SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Supabase URL and service-role key are required outside direct Postgres GRI mode");
  }
  return createSupabaseClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
