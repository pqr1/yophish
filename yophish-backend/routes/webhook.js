import { Router } from "express";
import { handleResendWebhook } from "../controllers/webhookController.js";

const router = Router();

router.post("/resend", handleResendWebhook);

export default router;
