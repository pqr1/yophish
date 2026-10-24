import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { getDb } from "../database/db.js";

const TOKEN_TTL = "12h";
const PASSWORD_MIN_LENGTH = 10;

function isStrongPassword(password) {
  if (typeof password !== "string") return false;
  return (
    password.length >= PASSWORD_MIN_LENGTH &&
    /[a-z]/.test(password) &&
    /[A-Z]/.test(password) &&
    /\d/.test(password)
  );
}

function cleanUser(user) {
  const { password_hash, ...rest } = user;
  return rest;
}

export async function signup(req, res) {
  const { name, email, password } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ message: "Name, email, and password are required." });
  }
  if (!isStrongPassword(password)) {
    return res.status(400).json({
      message:
        "Password must be at least 10 characters long and include an uppercase letter, lowercase letter, and number.",
    });
  }

  try {
    const db = await getDb();
    const existing = await db.get(`SELECT id FROM users WHERE email = ?`, email.toLowerCase());
    if (existing) {
      return res.status(409).json({ message: "An account with that email already exists." });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const { lastID } = await db.run(
      `INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)`,
      [name.trim(), email.toLowerCase(), passwordHash],
    );
    const user = await db.get(`SELECT * FROM users WHERE id = ?`, lastID);
    res.status(201).json({ user: cleanUser(user) });
  } catch (error) {
    console.error("Signup failed", error);
    res.status(500).json({ message: "Unable to create account." });
  }
}

export async function login(req, res) {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: "Email and password are required." });
  }

  try {
    const db = await getDb();
    const user = await db.get(`SELECT * FROM users WHERE email = ?`, email.toLowerCase());
    if (!user) {
      return res.status(401).json({ message: "Invalid email or password." });
    }

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      return res.status(401).json({ message: "Invalid email or password." });
    }

    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET ?? "dev-secret", {
      expiresIn: TOKEN_TTL,
    });

    res.json({ token, user: cleanUser(user) });
  } catch (error) {
    console.error("Login failed", error);
    res.status(500).json({ message: "Unable to login right now." });
  }
}
