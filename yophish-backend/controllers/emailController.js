import { sendTransactionalEmail } from "../services/resendService.js";

export async function sendEmail(req, res) {
  const { to, subject, html } = req.body ?? {};

  if (!to || !subject || !html) {
    return res.status(400).json({ message: "Recipient, subject, and html body are required." });
  }

  try {
    const response = await sendTransactionalEmail({ to, subject, html });

    if (response.error) {
      console.error("[Resend] Email dispatch failed:", response.error);
      return res.status(400).json({ message: "Email provider rejected the request." });
    }

    return res.json({ ok: true, id: response.data?.id ?? null });
  } catch (error) {
    const message = process.env.RESEND_API_KEY ? "Unable to send email right now." : "Transactional email is not configured.";
    console.error("[Resend] Unexpected failure", error);
    return res.status(500).json({ message });
  }
}
