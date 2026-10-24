import { Resend } from "resend";
import { v4 as uuidv4 } from "uuid";

let resendClient;

function getResendClient() {
  if (!process.env.RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY is not configured");
  }

  if (!resendClient) {
    resendClient = new Resend(process.env.RESEND_API_KEY);
  }

  return resendClient;
}

// Original function — unchanged, still used by emailController.js
export async function sendTransactionalEmail({ to, subject, html, text, tags, headers }) {
  const resend = getResendClient();
  const from = process.env.RESEND_FROM ?? "Notifications <notifications@yophish.app>";
  const replyTo = process.env.RESEND_REPLY_TO ?? "support@yophish.app";

  const normalizedRecipients = Array.isArray(to) ? to : [to];

  const payload = {
    from,
    to: normalizedRecipients,
    subject,
    html,
    reply_to: replyTo,
    ...(text ? { text } : {}),
    ...(tags?.length ? { tags } : {}),
    ...(headers ? { headers } : {}),
  };

  return resend.emails.send(payload);
}

// ✅ NEW: used by campaignController.js when sending phishing emails
// generates a unique token per recipient, injects tracking link, saves token to DB
export async function sendPhishingEmail({ to, subject, html, recipientId, db }) {
  const resend = getResendClient();
  const from = process.env.RESEND_FROM ?? "Notifications <notifications@yophish.app>";
  const replyTo = process.env.RESEND_REPLY_TO ?? "support@yophish.app";

  // 1. Generate a unique token for this specific recipient
  const token = uuidv4();

  // 2. Build the tracking URL — set BASE_URL in your .env
  const BASE_URL = process.env.BASE_URL || "http://localhost:3000";
  const trackingUrl = `${BASE_URL}/track/${token}`;

  // 3. Replace {{PHISHING_LINK}} in the email body with the tracking URL
  const finalHtml = html.replace(/\{\{PHISHING_LINK\}\}/g, trackingUrl);

  // 4. Save the token to the recipients row BEFORE sending
  //    so even if Resend fails we have a record
  await db.run(
    `UPDATE recipients SET token = ? WHERE id = ?`,
    [token, recipientId]
  );

  // 5. Send via Resend
  const result = await resend.emails.send({
    from,
    to: Array.isArray(to) ? to : [to],
    subject,
    html: finalHtml,
    reply_to: replyTo,
  });

  return { result, token };
}