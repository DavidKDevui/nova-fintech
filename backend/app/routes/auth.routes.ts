import { Router } from "express";
import type { AuthService } from "../services/auth.service";
import { createAuthController } from "../controllers/auth.controller";
import { authMiddleware } from "../middlewares/auth.middleware";

export function authRoutes(authService: AuthService) {
  const router = Router();
  const controller = createAuthController(authService);

  // Public
  router.post("/login", controller.login);
  router.post("/refresh-token", controller.refresh);
  router.post("/setup-password", controller.setupPassword);
  router.post("/forgot-password", controller.forgotPassword);
  router.post("/reset-password", controller.resetPassword);

  // Protected
  router.get("/me", authMiddleware, controller.me);
  router.post("/change-password", authMiddleware, controller.changePassword);
  router.post("/logout", authMiddleware, controller.logout);
  router.delete("/delete-account", authMiddleware, controller.deleteAccount);

  return router;
}
