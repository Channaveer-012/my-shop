const express = require("express");
const Database = require("better-sqlite3");

const app = express();
const db = new Database("shop.db");

// Three tables: products, orders, and the items inside each order
db.exec(`
  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    price_cents INTEGER NOT NULL,
    emoji TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_name TEXT NOT NULL,
    total_cents INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL,
    product_id INTEGER NOT NULL,
    qty INTEGER NOT NULL,
    price_cents INTEGER NOT NULL
  );
`);

// Fill the shop with sample products, but only the first time
const productCount = db.prepare("SELECT COUNT(*) AS n FROM products").get().n;
if (productCount === 0) {
  const insert = db.prepare(
    "INSERT INTO products (name, price_cents, emoji) VALUES (?, ?, ?)"
  );
  insert.run("Headphones", 5999, "🎧");
  insert.run("Backpack", 3450, "🎒");
  insert.run("Coffee Mug", 1200, "☕");
  insert.run("Sunglasses", 2500, "🕶️");
  insert.run("Notebook", 599, "📓");
  insert.run("Water Bottle", 1800, "🧴");
}

app.use(express.json());
app.use(express.static("public"));

// GET: send all products to the page
app.get("/api/products", (req, res) => {
  res.json(db.prepare("SELECT id, name, price_cents, emoji FROM products").all());
});

// POST: place an order
app.post("/api/orders", (req, res) => {
  const { name, items } = req.body;

  if (!name || !name.trim() || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: "Enter your name and add at least one item." });
  }

  // IMPORTANT: we look up prices in OUR database. We never trust prices sent by the browser.
  const getProduct = db.prepare("SELECT id, price_cents FROM products WHERE id = ?");
  let total = 0;
  const lines = [];

  for (const item of items) {
    const qty = Number(item.qty);
    const product = getProduct.get(item.id);
    if (!product || !Number.isInteger(qty) || qty < 1 || qty > 99) {
      return res.status(400).json({ error: "Invalid item in cart." });
    }
    total += product.price_cents * qty;
    lines.push({ product_id: product.id, qty, price_cents: product.price_cents });
  }

  // A transaction means "save everything, or save nothing"
  const saveOrder = db.transaction(() => {
    const result = db
      .prepare("INSERT INTO orders (customer_name, total_cents) VALUES (?, ?)")
      .run(name.trim(), total);
    const insertItem = db.prepare(
      "INSERT INTO order_items (order_id, product_id, qty, price_cents) VALUES (?, ?, ?, ?)"
    );
    for (const line of lines) {
      insertItem.run(result.lastInsertRowid, line.product_id, line.qty, line.price_cents);
    }
    return result.lastInsertRowid;
  });

  const orderId = saveOrder();
  res.json({ orderId: orderId, total_cents: total });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Shop running at http://localhost:" + PORT);
});