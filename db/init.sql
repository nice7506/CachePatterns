CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS products (
    id SERIAL PRIMARY KEY,
    sku VARCHAR(32) NOT NULL UNIQUE,
    name TEXT NOT NULL,
    description TEXT,
    price NUMERIC(10, 2) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

TRUNCATE TABLE products RESTART IDENTITY;

INSERT INTO products (sku, name, description, price)
VALUES
    ('SKU-RED-SHOE', 'Red Running Shoe', 'Lightweight running shoe with breathable mesh upper.', 89.99),
    ('SKU-BLUE-HOODIE', 'Blue Hoodie', 'Warm hoodie made from recycled polyester.', 59.5),
    ('SKU-GREEN-WATER', 'Green Water Bottle', 'Insulated stainless steel water bottle (1L).', 24.75),
    ('SKU-BLACK-BAG', 'Black Travel Bag', 'Carry-on compliant bag with modular compartments.', 129.0);
