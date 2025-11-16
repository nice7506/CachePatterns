import { query } from "../config/database.js";

export const getAllProducts = async () => {
  const { rows } = await query(
    `
    SELECT id, sku, name, description, price, updated_at
    FROM products
    ORDER BY id
    `
  );
  return rows;
};

export const getProductById = async (id) => {
  const { rows } = await query(
    `
    SELECT id, sku, name, description, price, updated_at
    FROM products
    WHERE id = $1
    `,
    [id]
  );
  return rows[0] ?? null;
};

export const updateProductPrice = async (id, price) => {
  const { rows } = await query(
    `
    UPDATE products
    SET price = $2, updated_at = NOW()
    WHERE id = $1
    RETURNING id, sku, name, description, price, updated_at
    `,
    [id, price]
  );
  return rows[0] ?? null;
};
