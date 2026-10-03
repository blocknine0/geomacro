#!/usr/bin/env bun
import { execFileSync } from "node:child_process";

const PROJECT_REF = "ldpwajisioljyjtojvfx";
const ALLOWED_TABLES = new Set([
  "live_external_sources",
  "live_source_certification_records",
  "live_world_bank_indicator_latest",
  "live_external_observations",
]);
const IDENTIFIER = /^[a-z_][a-z0-9_]*$/i;
const MAX_OUTPUT_BYTES = 32 * 1024 * 1024;

type QueryResult = { data: Record<string, unknown>[] | null; error: { code: string; message: string } | null };
type OrderOptions = { ascending?: boolean; nullsFirst?: boolean };
type Filter = { op: "eq" | "lte" | "in"; column: string; value: unknown };

function assertIdentifier(value: string) {
  if (!IDENTIFIER.test(value)) throw new Error("DIRECT_POSTGRES_IDENTIFIER_INVALID");
  return value;
}

function sqlLiteral(value: unknown): string {
  if (value === null) return "NULL";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("DIRECT_POSTGRES_NUMBER_INVALID");
    return String(value);
  }
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  return `'${String(value).replaceAll("'", "''")}'`;
}

function validateDatabaseUrl(raw: string) {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error("DIRECT_POSTGRES_DB_URL_INVALID");
  }
  if (!["postgres:", "postgresql:"].includes(parsed.protocol) || !parsed.password || parsed.pathname !== "/postgres") {
    throw new Error("DIRECT_POSTGRES_DB_URL_INVALID");
  }
  const direct = parsed.hostname === `db.${PROJECT_REF}.supabase.co` && parsed.username === "postgres";
  const pooler = parsed.hostname.endsWith(".pooler.supabase.com") && parsed.username === `postgres.${PROJECT_REF}`;
  if (!direct && !pooler) throw new Error("DIRECT_POSTGRES_DB_TARGET_INVALID");
  return raw;
}

class DirectPostgresQuery implements PromiseLike<QueryResult> {
  private columns = "*";
  private filters: Filter[] = [];
  private orders: Array<{ column: string; options: OrderOptions }> = [];
  private rangeFrom: number | null = null;
  private rangeTo: number | null = null;

  constructor(private readonly dbUrl: string, private readonly table: string) {}

  select(columns: string) {
    const selected = columns.split(",").map((value) => value.trim()).filter(Boolean);
    if (!selected.length || selected.some((value) => !IDENTIFIER.test(value))) {
      throw new Error("DIRECT_POSTGRES_SELECT_INVALID");
    }
    this.columns = selected.map(assertIdentifier).join(",");
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters.push({ op: "eq", column: assertIdentifier(column), value });
    return this;
  }

  lte(column: string, value: unknown) {
    this.filters.push({ op: "lte", column: assertIdentifier(column), value });
    return this;
  }

  in(column: string, values: unknown[]) {
    if (!Array.isArray(values) || values.length < 1 || values.length > 200) {
      throw new Error("DIRECT_POSTGRES_IN_INVALID");
    }
    this.filters.push({ op: "in", column: assertIdentifier(column), value: [...values] });
    return this;
  }

  order(column: string, options: OrderOptions = {}) {
    this.orders.push({ column: assertIdentifier(column), options });
    return this;
  }

  range(from: number, to: number) {
    if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to < from || to - from + 1 > 1_000) {
      throw new Error("DIRECT_POSTGRES_RANGE_INVALID");
    }
    this.rangeFrom = from;
    this.rangeTo = to;
    return this;
  }

  private sql() {
    const where = this.filters.map((filter) => {
      if (filter.op === "eq") return `${filter.column} = ${sqlLiteral(filter.value)}`;
      if (filter.op === "lte") return `${filter.column} <= ${sqlLiteral(filter.value)}`;
      const values = filter.value as unknown[];
      return `${filter.column} IN (${values.map(sqlLiteral).join(",")})`;
    });
    const order = this.orders.map(({ column, options }) => {
      const direction = options.ascending === false ? "DESC" : "ASC";
      const nulls = options.nullsFirst === true ? " NULLS FIRST" : options.nullsFirst === false ? " NULLS LAST" : "";
      return `${column} ${direction}${nulls}`;
    });
    const pagination = this.rangeFrom === null || this.rangeTo === null
      ? ""
      : ` LIMIT ${this.rangeTo - this.rangeFrom + 1} OFFSET ${this.rangeFrom}`;
    return `SELECT row_to_json(q)::text FROM (SELECT ${this.columns} FROM public.${this.table}${where.length ? ` WHERE ${where.join(" AND ")}` : ""}${order.length ? ` ORDER BY ${order.join(",")}` : ""}${pagination}) q;`;
  }

  private async execute(): Promise<QueryResult> {
    try {
      const output = execFileSync("psql", [this.dbUrl, "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-c", this.sql()], {
        encoding: "utf8",
        maxBuffer: MAX_OUTPUT_BYTES,
        env: process.env,
        stdio: ["ignore", "pipe", "pipe"],
      });
      const data = output.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
      return { data, error: null };
    } catch {
      return {
        data: null,
        error: {
          code: "DIRECT_POSTGRES_QUERY_FAILED",
          message: "direct postgres query failed",
        },
      };
    }
  }

  then<TResult1 = QueryResult, TResult2 = never>(
    onfulfilled?: ((value: QueryResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return this.execute().then(onfulfilled ?? undefined, onrejected ?? undefined);
  }
}

export function createDirectPostgresClient(databaseUrl: string) {
  const dbUrl = validateDatabaseUrl(String(databaseUrl ?? "").trim());
  return {
    from(table: string) {
      const normalized = assertIdentifier(String(table ?? "").trim());
      if (!ALLOWED_TABLES.has(normalized)) throw new Error("DIRECT_POSTGRES_TABLE_NOT_ALLOWED");
      return new DirectPostgresQuery(dbUrl, normalized);
    },
  };
}
