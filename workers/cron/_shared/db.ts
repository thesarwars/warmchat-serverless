/// <reference types="@cloudflare/workers-types" />

/**
 * Thin, typed wrappers over D1 prepared statements. Keeps endpoints free of
 * `.bind(...).first()/.all()/.run()` boilerplate and centralizes the cast.
 */

export async function queryFirst<T>(
  db: D1Database,
  sql: string,
  ...params: unknown[]
): Promise<T | null> {
  const row = await db.prepare(sql).bind(...params).first<T>();
  return row ?? null;
}

export async function queryAll<T>(
  db: D1Database,
  sql: string,
  ...params: unknown[]
): Promise<T[]> {
  const { results } = await db.prepare(sql).bind(...params).all<T>();
  return results ?? [];
}

export async function execute(
  db: D1Database,
  sql: string,
  ...params: unknown[]
): Promise<D1Result> {
  return db.prepare(sql).bind(...params).run();
}

/** Current UTC time as an ISO-8601 string - the format every TEXT timestamp column expects. */
export function nowIso(): string {
  return new Date().toISOString();
}
