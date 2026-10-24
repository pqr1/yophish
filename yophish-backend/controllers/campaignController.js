import { getDb } from "../database/db.js";
import { sendTransactionalEmail, sendPhishingEmail } from "../services/resendService.js"; // ✅ sendPhishingEmail added

function parseRecipients(rawRecipients = []) {
  return rawRecipients
    .map((entry) => {
      if (typeof entry === "string") {
        return entry.trim();
      }
      if (typeof entry === "object" && entry.email) {
        return entry.email.trim();
      }
      return null;
    })
    .filter(Boolean);
}

export async function createCampaign(req, res) {
  const { name, subject, body, template = "templateA", recipients: rawRecipients } = req.body;
  const userId = req.user?.id;

  if (!name || !subject || !body) {
    return res.status(400).json({ message: "Name, subject, and body are required." });
  }

  const recipients = parseRecipients(rawRecipients);
  if (recipients.length === 0) {
    return res.status(400).json({ message: "At least one recipient is required." });
  }

  try {
    const db = await getDb();
    const { lastID } = await db.run(
      `INSERT INTO campaigns (name, subject, body, template, created_by) VALUES (?, ?, ?, ?, ?)`,
      [name.trim(), subject.trim(), body, template, userId ?? null],
    );

    const insert = await db.prepare(`INSERT INTO recipients (campaign_id, email) VALUES (?, ?)`);
    try {
      for (const email of recipients) {
        await insert.run(lastID, email);
      }
    } finally {
      await insert.finalize();
    }

    const campaign = await db.get(`SELECT * FROM campaigns WHERE id = ?`, lastID);
    res.status(201).json({ campaignId: lastID, campaign });
  } catch (error) {
    console.error("Create campaign failed", error);
    res.status(500).json({ message: "Unable to create campaign." });
  }
}

export async function sendCampaign(req, res) {
  const { campaignId } = req.body;
  const userId = req.user?.id;

  if (!campaignId) {
    return res.status(400).json({ message: "campaignId is required." });
  }

  try {
    const db = await getDb();
    const campaign = await db.get(
      `SELECT * FROM campaigns WHERE id = ? AND created_by = ?`,
      campaignId,
      userId ?? null,
    );
    if (!campaign) {
      return res.status(404).json({ message: "Campaign not found." });
    }

    const recipients = await db.all(
      `SELECT id, email FROM recipients WHERE campaign_id = ?`,
      campaignId,
    );

    if (recipients.length === 0) {
      return res.status(400).json({ message: "Campaign has no recipients to send to." });
    }

    const now = new Date().toISOString();

    await db.run(
      `UPDATE recipients SET sent = 1, sent_at = ?, message_id = NULL WHERE campaign_id = ?`,
      now,
      campaignId,
    );

    const sendErrors = [];
    const messageIds = [];

    for (const recipient of recipients) {
      try {
        // ✅ switched from sendTransactionalEmail to sendPhishingEmail
        // this generates a unique token per recipient and injects the tracking link
        const { result } = await sendPhishingEmail({
          to: recipient.email,
          subject: campaign.subject,
          html: campaign.body,
          recipientId: recipient.id,
          db,
        });

        if (result?.error) {
          sendErrors.push({ email: recipient.email, message: result.error.message });
        } else {
          const messageId = result?.data?.id ?? null;
          if (messageId) {
            await db.run(`UPDATE recipients SET message_id = ? WHERE id = ?`, messageId, recipient.id);
            messageIds.push(messageId);
          }
        }
      } catch (error) {
        sendErrors.push({ email: recipient.email, message: error.message });
      }
    }

    if (sendErrors.length > 0) {
      console.error("[Resend] Failed to send campaign to some recipients", sendErrors);
      return res.status(400).json({
        message: "Email provider rejected one or more recipients.",
        errors: sendErrors,
      });
    }

    res.json({ message: "Campaign dispatched.", sentCount: recipients.length, ids: messageIds });
  } catch (error) {
    console.error("Send campaign failed", error);
    res.status(500).json({ message: "Unable to send campaign." });
  }
}

export async function listCampaigns(req, res) {
  try {
    const db = await getDb();
    const userId = req.user?.id ?? null;

    const campaigns = userId
      ? await db.all(
          `SELECT id, name, subject, created_at
           FROM campaigns
           WHERE created_by = ?
           ORDER BY created_at DESC`,
          userId,
        )
      : [];

    res.json({ campaigns });
  } catch (error) {
    console.error("List campaigns failed", error);
    res.status(500).json({ message: "Unable to load campaigns." });
  }
}

export async function getOverview(req, res) {
  try {
    const userId = req.user?.id;
    const db = await getDb();

    const totals =
      (await db.get(
        `SELECT
           COUNT(r.id)                                        AS totalRecipients,
           SUM(r.sent)                                        AS sent,
           SUM(CASE WHEN r.sent = 0 THEN 1 ELSE 0 END)       AS notSent,
           SUM(r.opened)                                      AS opens,
           SUM(CASE WHEN r.opened = 0 THEN 1 ELSE 0 END)     AS notOpens,
           SUM(r.clicked)                                     AS clicks
         FROM recipients r
         INNER JOIN campaigns c ON r.campaign_id = c.id
         WHERE c.created_by = ?`,
        userId ?? null,
      )) ?? {};

    const sent     = totals.sent     ?? 0;
    const opens    = totals.opens    ?? 0;
    const notOpens = totals.notOpens ?? 0;
    const clicks   = totals.clicks   ?? 0;

    const failureRate = sent > 0 ? (clicks / sent) * 100 : 0;  // ✅ now uses clicks (link clicked) not opens (email opened)
    const successRate = sent > 0 ? ((sent - clicks) / sent) * 100 : 0;  // ✅ did NOT click the link

    // ✅ timeline now shows clicks per day instead of sent per day
    const timelineRaw = await db.all(
      `SELECT
         date(r.clicked_at) AS bucket_date,
         COUNT(*)           AS clickCount
       FROM recipients r
       INNER JOIN campaigns c ON r.campaign_id = c.id
       WHERE r.clicked = 1
         AND r.clicked_at IS NOT NULL
         AND c.created_by = ?
       GROUP BY bucket_date
       ORDER BY bucket_date ASC`,
      userId ?? null,
    );

    const timeline = timelineRaw.map((entry) => ({
      label:      entry.bucket_date,
      sentCount:  entry.clickCount,
      timestamp:  entry.bucket_date,
      bucketType: "day",
    }));

    res.json({
      totals: {
        totalRecipients: totals.totalRecipients ?? 0,
        sent,
        notSent:      totals.notSent ?? 0,
        opens:        totals.opens   ?? 0,
        notOpens:     totals.notOpens ?? 0,
        clicks,
        failureRate:  Number(failureRate.toFixed(1)),
        successRate:  Number(successRate.toFixed(1)),
      },
      timeline,
    });
  } catch (error) {
    console.error("Overview failed", error);
    res.status(500).json({ message: "Unable to load overview data." });
  }
}

export async function getResults(req, res) {
  const { id } = req.params;
  try {
    const db = await getDb();
    const campaign = await db.get(
      `SELECT * FROM campaigns WHERE id = ? AND created_by = ?`,
      id,
      req.user?.id ?? null,
    );
    if (!campaign) {
      return res.status(404).json({ message: "Campaign not found." });
    }

    const recipients = await db.all(
      `SELECT id, email, sent, opened, clicked, risk_level
       FROM recipients WHERE campaign_id = ? ORDER BY email ASC`,
      id,
    );

    res.json({ campaign, recipients });
  } catch (error) {
    console.error("Get results failed", error);
    res.status(500).json({ message: "Unable to load campaign results." });
  }
}

export async function getStaffStats(req, res) {
  try {
    const db = await getDb();
    const staff = await db.all(
      `SELECT
         r.id,
         r.email,
         r.opened,
         r.clicked,
         r.risk_level,
         c.name AS campaign_name
       FROM recipients r
       LEFT JOIN campaigns c ON r.campaign_id = c.id
       WHERE c.created_by = ?
       ORDER BY r.email ASC`,
      req.user?.id ?? null,
    );

    res.json({ staff });
  } catch (error) {
    console.error("Get staff stats failed", error);
    res.status(500).json({ message: "Unable to load staff statistics." });
  }
}