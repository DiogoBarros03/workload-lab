import pg from "pg";

export type Item = {
  id: number;
  name: string;
  quantity: number;
  created_at: string;
  updated_at: string;
};

export type ItemInput = { name: string; quantity: number };

const COLS = "id, name, quantity, created_at, updated_at";

export function createItemsRepo(pool: pg.Pool) {
  const one = async (sql: string, params: unknown[]): Promise<Item | null> => {
    const { rows } = await pool.query<Item>(sql, params);
    return rows[0] ?? null;
  };
  return {
    create: (input: ItemInput) =>
      one(`INSERT INTO items (name, quantity) VALUES ($1, $2) RETURNING ${COLS}`, [
        input.name,
        input.quantity,
      ]),
    get: (id: number) => one(`SELECT ${COLS} FROM items WHERE id = $1`, [id]),
    update: (id: number, input: ItemInput) =>
      one(
        `UPDATE items SET name = $2, quantity = $3, updated_at = now() WHERE id = $1 RETURNING ${COLS}`,
        [id, input.name, input.quantity],
      ),
    remove: (id: number) => one(`DELETE FROM items WHERE id = $1 RETURNING ${COLS}`, [id]),
    ping: () => pool.query("SELECT 1"),
  };
}

export type ItemsRepo = ReturnType<typeof createItemsRepo>;
