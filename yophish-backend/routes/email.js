import { Router } from "express";
import { sendEmail } from "../controllers/emailController.js";

const router = Router();

router.post("/", sendEmail);

export default router;
