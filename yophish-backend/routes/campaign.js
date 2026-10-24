import { Router } from "express";
import {
  createCampaign,
  getOverview,
  getResults,
  getStaffStats,
  listCampaigns,
  sendCampaign,
} from "../controllers/campaignController.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

router.use(requireAuth);

router.post("/", createCampaign);
router.post("/send", sendCampaign);
router.get("/", listCampaigns);
router.get("/overview", getOverview);
router.get("/results/:id", getResults);
router.get("/staff", getStaffStats);

export default router;
