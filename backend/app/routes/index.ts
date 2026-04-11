import { Router } from "express";
import { createHealthService } from "../services/health.service";
import { createAuthService } from "../services/auth.service";
import { createMailService } from "../services/mail.service";
import { healthRoutes } from "./health.routes";
import { authRoutes } from "./auth.routes";

export function createRouter() {
  const router = Router();

  const healthService = createHealthService();
  const mailService = createMailService();
  const authService = createAuthService(mailService);

  router.use("/health", healthRoutes(healthService));
  router.use("/auth", authRoutes(authService));

  return router;
}
