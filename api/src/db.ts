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

export function createStore(pool: pg.Pool) {
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
    ping: () => pool.query("SELECT 1"),
  };
}

export type Store = ReturnType<typeof createStore>;
