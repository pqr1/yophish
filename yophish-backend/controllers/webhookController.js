import { Webhook } from "svix";
import { getDb } from "../database/db.js";

const EVENT_TO_COLUMN = {
  "email.opened": { column: "opened", timestampColumn: "opened_at" },
  "email.clicked": { column: "clicked", timestampColumn: "clicked_at", bumpRisk: true },
};

function getTagValue(tags, key) {
  if (!tags) return null;
  if (Array.isArray(tags)) {
    const tag = tags.find((entry) => entry?.name === key);
    return tag?.value ?? null;
  }
  if (typeof tags === "object" && !Array.isArray(tags)) {
    const value = tags[key];
    return typeof value === "string" || typeof value === "number" ? value : null;
  }
  return null;
}

function normalizeAddress(entry) {
  if (!entry) return null;
  if (typeof entry === "string") {
    return entry;
  }
  if (typeof entry === "object" && typeof entry.email === "string") {
    return entry.email;
  }
  return null;
}

function extractEmailAddress(data) {
  if (!data) return null;

  if (Array.isArray(data.to) && data.to.length > 0) {
    const normalized = normalizeAddress(data.to[0]);
    if (normalized) {
      return normalized;
    }
  }

  const direct = normalizeAddress(data.to);
  if (direct) {
    return direct;
  }

  if (typeof data.email === "string") {
    return data.email;
  }

  if (typeof data.address === "string") {
    return data.address;
  }

  return null;
}

export async function handleResendWebhook(req, res) {
  const webhookSecret = process.env.RESEND_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.warn("[Resend] Webhook secret is not configured.");
    return res.status(500).json({ message: "Webhook secret is not configured." });
  }

  const payload = typeof req.rawBody === "string" ? req.rawBody : null;
  if (!payload) {
    return res.status(400).json({ message: "Missing raw webhook payload." });
  }

  const headers = {
    "svix-id": req.headers["svix-id"],
    "svix-timestamp": req.headers["svix-timestamp"],
    "svix-signature": req.headers["svix-signature"],
  };

  if (!headers["svix-id"] || !headers["svix-timestamp"] || !headers["svix-signature"]) {
    return res.status(400).json({ message: "Missing Svix signature headers." });
  }

  let event;
  try {
    const webhook = new Webhook(webhookSecret);
    event = webhook.verify(payload, headers);
  } catch (error) {
    console.error("[Resend] Failed to verify webhook signature", error);
    return res.status(400).json({ message: "Invalid webhook signature." });
  }

  const updateConfig = EVENT_TO_COLUMN[event.type];
  if (!updateConfig) {
    return res.json({ ok: true, ignored: true });
  }

  const tags = event.data?.tags ?? [];
  const campaignId = getTagValue(tags, "campaign_id");
  const recipientId = getTagValue(tags, "recipient_id");
  const emailId = event.data?.email_id ?? event.data?.message_id ?? event.data?.id ?? null;
  const rawEmail = extractEmailAddress(event.data);
  const email = typeof rawEmail === "string" ? rawEmail.toLowerCase() : null;

  try {
    const db = await getDb();
    const params = [];
    const fields = [`${updateConfig.column} = 1`];

    if (updateConfig.timestampColumn) {
      fields.push(`${updateConfig.timestampColumn} = ?`);
      params.push(new Date().toISOString());
    }

    if (updateConfig.bumpRisk) {
      fields.push(`risk_level = CASE WHEN risk_level = 'Low' THEN 'Medium' ELSE risk_level END`);
    }

    const filters = [];

    const numericCampaignId = campaignId != null ? Number(campaignId) : NaN;
    if (!Number.isNaN(numericCampaignId)) {
      filters.push("campaign_id = ?");
      params.push(numericCampaignId);
    }

    const numericRecipientId = recipientId != null ? Number(recipientId) : NaN;
    if (!Number.isNaN(numericRecipientId)) {
      filters.push("id = ?");
      params.push(numericRecipientId);
    }

    if (emailId) {
      filters.push("message_id = ?");
      params.push(emailId);
    }

    if (!emailId && Number.isNaN(numericRecipientId) && email) {
      filters.push("LOWER(email) = ?");
      params.push(email);
    }

    if (filters.length === 0) {
      console.warn("[Resend] Ignoring webhook with insufficient identifiers", {
        campaignId,
        recipientId,
        emailId,
        email,
      });
      return res.json({ ok: false, reason: "missing identifiers" });
    }

    const query = `UPDATE recipients SET ${fields.join(", ")} WHERE ${filters.join(" AND ")}`;

    const result = await db.run(query, params);
    res.json({ ok: true, updated: result.changes ?? 0 });

  } catch (error) {
    console.error("[Resend] Failed to persist webhook event", error);
    res.status(500).json({ message: "Unable to process webhook event." });
  }
}
