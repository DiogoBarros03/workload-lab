import pg from "pg";

type Row = Record<string, unknown>;

// One generic CRUD repo per table; `writable` whitelists the columns a client may set.
export function createRepo<T extends Row, In extends Row>(
  pool: pg.Pool,
  table: string,
  writable: readonly (keyof In & string)[],
) {
  const one = async (sql: string, params: unknown[]): Promise<T | null> => {
    const { rows } = await pool.query<T>(sql, params);
    return rows[0] ?? null;
  };
  const values = (input: In) => writable.map((c) => input[c]);
  const insertCols = writable.join(", ");
  const insertVals = writable.map((_, i) => `$${i + 1}`).join(", ");
  const setList = writable.map((c, i) => `${c} = $${i + 2}`).join(", ");

  return {
    create: (input: In) =>
      one(`INSERT INTO ${table} (${insertCols}) VALUES (${insertVals}) RETURNING *`, values(input)),
    get: (id: number) => one(`SELECT * FROM ${table} WHERE id = $1`, [id]),
    update: (id: number, input: In) =>
      one(`UPDATE ${table} SET ${setList}, updated_at = now() WHERE id = $1 RETURNING *`, [
        id,
        ...values(input),
      ]),
    remove: (id: number) => one(`DELETE FROM ${table} WHERE id = $1 RETURNING id`, [id]),
  };
}

export type Author = {
  id: number;
  name: string;
  country: string;
  created_at: string;
  updated_at: string;
};
export type AuthorInput = { name: string; country: string };

export type Book = {
  id: number;
  author_id: number;
  title: string;
  isbn: string;
  price_cents: number;
  stock: number;
  created_at: string;
  updated_at: string;
};
export type BookInput = {
  author_id: number;
  title: string;
  isbn: string;
  price_cents: number;
  stock: number;
};

export type DbLoad = {
  maxConnections: number;
  clientBackends: number;
  activeBackends: number;
  waitingBackends: number;
  xactCommit: number;
  xactRollback: number;
  blksHit: number;
  blksRead: number;
  tupInserted: number;
  tupUpdated: number;
  tupDeleted: number;
  tupFetched: number;
};

// Server-wide backends plus cumulative counters for this database, in one round trip.
const DB_LOAD_SQL = `
  SELECT
    (SELECT setting::int FROM pg_settings WHERE name = 'max_connections') AS "maxConnections",
    a.client::int AS "clientBackends", a.active::int AS "activeBackends", a.waiting::int AS "waitingBackends",
    d.xact_commit::float8 AS "xactCommit", d.xact_rollback::float8 AS "xactRollback",
    d.blks_hit::float8 AS "blksHit", d.blks_read::float8 AS "blksRead",
    d.tup_inserted::float8 AS "tupInserted", d.tup_updated::float8 AS "tupUpdated",
    d.tup_deleted::float8 AS "tupDeleted", d.tup_fetched::float8 AS "tupFetched"
  FROM pg_stat_database d,
    (SELECT count(*) AS client,
       count(*) FILTER (WHERE state = 'active' AND pid <> pg_backend_pid()) AS active,
       count(*) FILTER (WHERE state = 'active' AND wait_event IS NOT NULL AND pid <> pg_backend_pid()) AS waiting
     FROM pg_stat_activity WHERE backend_type = 'client backend') a
  WHERE d.datname = current_database()`;

// adminPool serves health and stats so they never queue behind traffic.
export function createStore(pool: pg.Pool, adminPool: pg.Pool) {
  return {
    authors: createRepo<Author, AuthorInput>(pool, "authors", ["name", "country"]),
    books: createRepo<Book, BookInput>(pool, "books", [
      "author_id",
      "title",
      "isbn",
      "price_cents",
      "stock",
    ]),
    booksByAuthor: async (authorId: number): Promise<Book[]> => {
      const { rows } = await pool.query<Book>(
        "SELECT * FROM books WHERE author_id = $1 ORDER BY id",
        [authorId],
      );
      return rows;
    },
    listAuthors: async ({ name, limit }: { name?: string; limit: number }): Promise<Author[]> => {
      const { rows } = await pool.query<Author>(
        "SELECT * FROM authors WHERE ($1::text IS NULL OR name = $1) ORDER BY id LIMIT $2",
        [name ?? null, limit],
      );
      return rows;
    },
    ping: () => adminPool.query("SELECT 1"),
    dbLoad: async (): Promise<DbLoad> => (await adminPool.query<DbLoad>(DB_LOAD_SQL)).rows[0],
    poolStats: () => ({
      max: pool.options.max,
      total: pool.totalCount,
      idle: pool.idleCount,
      waiting: pool.waitingCount,
    }),
  };
}

export type Store = ReturnType<typeof createStore>;
