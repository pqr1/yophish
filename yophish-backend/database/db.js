import path from "path";
import { fileURLToPath } from "url";
import sqlite3 from "sqlite3";
import { open } from "sqlite";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = path.join(__dirname, "..", "yophish.db");

export async function getDb() {
  return open({
    filename: DB_PATH,
    driver: sqlite3.Database,
  });
}

export async function ensureSchema(db) {
  await db.exec(`
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS campaigns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      subject TEXT NOT NULL,
      body TEXT NOT NULL,
      template TEXT NOT NULL,
      created_by INTEGER,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (created_by) REFERENCES users (id)
    );

    CREATE TABLE IF NOT EXISTS recipients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      campaign_id INTEGER NOT NULL,
      email TEXT NOT NULL,
      department TEXT DEFAULT 'General',
      sent INTEGER DEFAULT 0,
      opened INTEGER DEFAULT 0,
      clicked INTEGER DEFAULT 0,
      bounced INTEGER DEFAULT 0,
      risk_level TEXT DEFAULT 'Low',
      sent_at TEXT,
      opened_at TEXT,
      clicked_at TEXT,
      message_id TEXT,
      FOREIGN KEY (campaign_id) REFERENCES campaigns (id) ON DELETE CASCADE
    );
  `);

  const recipientColumns = await db.all(`PRAGMA table_info(recipients)`);

  const hasMessageId = recipientColumns.some((column) => column.name === "message_id");
  if (!hasMessageId) {
    await db.exec(`ALTER TABLE recipients ADD COLUMN message_id TEXT`);
  }

  // ✅ NEW: adds tracking token column to existing databases
  const hasToken = recipientColumns.some((column) => column.name === "token");
  if (!hasToken) {
    await db.exec(`ALTER TABLE recipients ADD COLUMN token TEXT`);
  }
}

export async function seedExampleData(db) {
  const existing = await db.get(`SELECT COUNT(*) as count FROM users`);
  if (existing?.count > 0) {
    return;
  }

  const passwordHash =
    "$2a$10$rfpxwubOrPMyG1Tkwn4geuXMyLqmMqrKcv0dLuJ8ni3aJKAVnIW.u"; // "password123"

  const { lastID: userId } = await db.run(
    `INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)`,
    ["Demo Admin", "admin@yophish.app", passwordHash],
  );

  const { lastID: campaignId } = await db.run(
    `INSERT INTO campaigns (name, subject, body, template, created_by) VALUES (?, ?, ?, ?, ?)`,
    [
      "October Awareness Test",
      "Security Awareness Simulation",
      "<p>This is a demo phishing email used for awareness testing.</p>",
      "templateA",
      userId,
    ],
  );

  // Seed recipients intentionally omitted to avoid hard-coded demo data
}

export async function initDb({ seed = false } = {}) {
  const db = await getDb();
  await ensureSchema(db);
  if (seed) {
    await seedExampleData(db);
  }
  await db.close();
}

if (process.argv.includes("--init")) {
  const seed = process.argv.includes("--seed");
  initDb({ seed })
    .then(() => {
      if (seed) {
        console.log("Database initialized with demo data at", DB_PATH);
      } else {
        console.log("Database schema ensured at", DB_PATH);
      }
    })
    .catch((err) => {
      console.error("Failed to initialize database:", err);
      process.exit(1);
    });
}