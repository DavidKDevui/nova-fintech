import { Router } from "express";
import type { AuthService } from "../services/auth.service";
import { createAuthController } from "../controllers/auth.controller";
import { authMiddleware } from "../middlewares/auth.middleware";

export function authRoutes(authService: AuthService) {
  const router = Router();
  const controller = createAuthController(authService);

  // Public
  router.post("/register", controller.register);
  router.post("/login", controller.login);
  router.post("/refresh-token", controller.refresh);
  router.post("/forgot-password", controller.forgotPassword);
  router.post("/reset-password", controller.resetPassword);

  // Protected (need token)
  router.post("/verify-email", authMiddleware, controller.verifyEmail);
  router.post("/resend-verification", authMiddleware, controller.resendVerification);
  router.post("/logout", authMiddleware, controller.logout);
  router.delete("/delete-account", authMiddleware, controller.deleteAccount);

  return router;
}
