import { Router } from "express";

const router = Router();

// GET /track/:token — hit when recipient clicks the phishing link in the email
router.get("/:token", async (req, res) => {
  const { token } = req.params;
  const redirectTo = process.env.REDIRECT_URL || "https://google.com";

  try {
    // 1. Look up the recipient row by token
    const recipient = await req.db.get(
      `SELECT * FROM recipients WHERE token = ?`,
      [token]
    );

    if (!recipient) {
      // Token not found — still redirect silently, don't expose error
      return res.redirect(redirectTo);
    }

    // 2. Only record the first click — ignore repeat visits
    if (!recipient.clicked) {
      await req.db.run(
        `UPDATE recipients
         SET clicked = 1, clicked_at = datetime('now')
         WHERE token = ?`,
        [token]
      );
    }

    // 3. Redirect to fake login page or any URL set in .env
    return res.redirect(redirectTo);

  } catch (err) {
    console.error("[Track] Error recording click:", err);
    return res.redirect(redirectTo);
  }
});

export default router;