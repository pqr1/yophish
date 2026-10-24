import jwt from "jsonwebtoken";
import { getDb } from "../database/db.js";

export async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({ message: "Missing authorization token." });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET ?? "dev-secret");
    const db = await getDb();
    const user = await db.get(`SELECT id, name, email FROM users WHERE id = ?`, decoded.userId);
    if (!user) {
      return res.status(401).json({ message: "Invalid token." });
    }
    req.user = user;
    next();
  } catch (error) {
    console.error("Auth error", error.message);
    res.status(401).json({ message: "Unauthorized." });
  }
}
