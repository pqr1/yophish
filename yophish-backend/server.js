import express from "express";
import cors from "cors";
import dotenv from "dotenv";

import authRoutes from "./routes/auth.js";
import campaignRoutes from "./routes/campaign.js";
import emailRoutes from "./routes/email.js";
import webhookRoutes from "./routes/webhook.js";
import trackRoutes from "./routes/track.js"; // ✅ NEW
import { requireAuth } from "./middleware/auth.js";
import { getOverview, getResults, getStaffStats } from "./controllers/campaignController.js";
import { initDb, getDb } from "./database/db.js"; // ✅ getDb added

dotenv.config();

const app = express();
app.use(cors());
app.use(
  express.json({
    verify: (req, _res, buf) => {
      if (req.originalUrl?.startsWith("/api/webhooks/resend")) {
        req.rawBody = buf.toString("utf8");
      }
    },
  }),
);

// ✅ NEW: attach a fresh db connection to every request so routes can use req.db
app.use(async (req, _res, next) => {
  req.db = await getDb();
  next();
});

app.get("/", (_req, res) => {
  res.json({ status: "Yophish backend running" });
});

// ✅ NEW: /track must be registered BEFORE requireAuth — no login needed to click a link
app.use("/track", trackRoutes);

app.use("/api/auth", authRoutes);
app.use("/api/campaigns", campaignRoutes);
app.use("/api/send-email", emailRoutes);
app.use("/api/webhooks", webhookRoutes);

app.get("/api/overview", requireAuth, getOverview);
app.get("/api/results/:id", requireAuth, getResults);
app.get("/api/staff", requireAuth, getStaffStats);

const PORT = process.env.PORT || 3000;

async function start() {
  try {
    await initDb();
    app.listen(PORT, () => {
      console.log(`Yophish backend listening on http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error("Failed to bootstrap server", error);
    process.exit(1);
  }
}

start();