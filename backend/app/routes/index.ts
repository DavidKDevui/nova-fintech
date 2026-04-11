import { Router } from "express";
import { createHealthService } from "../services/health.service";
import { createAuthService } from "../services/auth.service";
import { createAdminService } from "../services/admin.service";
import { createMailService } from "../services/mail.service";
import { healthRoutes } from "./health.routes";
import { authRoutes } from "./auth.routes";
import { adminRoutes } from "./admin.routes";

export function createRouter() {
  const router = Router();

  const healthService = createHealthService();
  const mailService = createMailService();
  const authService = createAuthService(mailService);
  const adminService = createAdminService(mailService);

  router.use("/health", healthRoutes(healthService));
  router.use("/auth", authRoutes(authService));
  router.use("/admin", adminRoutes(adminService));

  return router;
}
