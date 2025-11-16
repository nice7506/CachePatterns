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
    ('SKU-BLUE-HOODIE', 'Blue Hoodie', 'Warm hoodie made from recycled polyester.', 59.50),
    ('SKU-GREEN-WATER', 'Green Water Bottle', 'Insulated stainless steel water bottle (1L).', 24.75),
    ('SKU-BLACK-BAG', 'Black Travel Bag', 'Carry-on compliant bag with modular compartments.', 129.00),
    ('SKU-WHITE-SOCKS', 'White Socks Pack', 'Pack of 5 cotton ankle socks.', 12.99),
    ('SKU-GAMING-MOUSE', 'Gaming Mouse', 'Ergonomic RGB mouse with 6 programmable buttons.', 39.99),
    ('SKU-MECHANICAL-KEY', 'Mechanical Keyboard', 'Backlit mechanical keyboard with blue switches.', 89.50),
    ('SKU-NOISE-HDST', 'Noise-Canceling Headphones', 'Over-ear wireless headphones with ANC.', 149.00),
    ('SKU-PHONE-CASE', 'Phone Case', 'Shockproof case for popular smartphone models.', 19.99),
    ('SKU-LAPTOP-STAND', 'Aluminum Laptop Stand', 'Adjustable stand for better ergonomics.', 34.95),
    ('SKU-USB-HUB', 'USB-C Hub', '7-in-1 USB-C hub with HDMI and PD.', 44.90),
    ('SKU-DESK-LAMP', 'LED Desk Lamp', 'Dimmable LED desk lamp with touch controls.', 29.99);
