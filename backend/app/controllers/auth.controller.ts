import type { Request, Response } from "express";
import { logger } from "../logger";
import type { AuthService } from "../services/auth.service";
import type { AuthRequest } from "../middlewares/auth.middleware";

export function createAuthController(authService: AuthService) {
  return {
    async login(req: Request, res: Response) {
      try {
        const { email, password } = req.body;
        if (!email || !password) {
          res.status(400).json({ error: "Email and password are required" });
          return;
        }
        const data = await authService.login(email, password);
        res.json(data);
      } catch (err: any) {
        if (err.message === "Invalid credentials") {
          res.status(401).json({ error: err.message });
          return;
        }
        logger.error(err, "Login failed");
        res.status(500).json({ error: "Internal server error" });
      }
    },

    async changePassword(req: Request, res: Response) {
      try {
        const { userId } = req as AuthRequest;
        const { currentPassword, newPassword } = req.body;
        if (!currentPassword || !newPassword) {
          res.status(400).json({ error: "Current password and new password are required" });
          return;
        }
        await authService.changePassword(userId, currentPassword, newPassword);
        res.json({ message: "Password changed" });
      } catch (err: any) {
        if (err.message === "Invalid current password") {
          res.status(401).json({ error: err.message });
          return;
        }
        logger.error(err, "Change password failed");
        res.status(500).json({ error: "Internal server error" });
      }
    },

    async refresh(req: Request, res: Response) {
      try {
        const { refreshToken } = req.body;
        if (!refreshToken) {
          res.status(400).json({ error: "Refresh token is required" });
          return;
        }
        const tokens = await authService.refresh(refreshToken);
        res.json(tokens);
      } catch {
        res.status(401).json({ error: "Invalid refresh token" });
      }
    },

    async forgotPassword(req: Request, res: Response) {
      try {
        const { email } = req.body;
        if (!email) {
          res.status(400).json({ error: "Email is required" });
          return;
        }
        await authService.forgotPassword(email);
        res.json({ message: "If this email exists, a reset link has been sent" });
      } catch (err) {
        logger.error(err, "Forgot password failed");
        res.status(500).json({ error: "Internal server error" });
      }
    },

    async resetPassword(req: Request, res: Response) {
      try {
        const { token, password } = req.body;
        if (!token || !password) {
          res.status(400).json({ error: "Token and password are required" });
          return;
        }
        await authService.resetPassword(token, password);
        res.json({ message: "Password reset successfully" });
      } catch (err: any) {
        if (err.message === "Invalid or expired reset token") {
          res.status(400).json({ error: err.message });
          return;
        }
        logger.error(err, "Reset password failed");
        res.status(500).json({ error: "Internal server error" });
      }
    },

    async logout(req: Request, res: Response) {
      try {
        const { userId } = req as AuthRequest;
        await authService.logout(userId);
        res.json({ message: "Logged out" });
      } catch (err) {
        logger.error(err, "Logout failed");
        res.status(500).json({ error: "Internal server error" });
      }
    },

    async deleteAccount(req: Request, res: Response) {
      try {
        const { userId } = req as AuthRequest;
        await authService.deleteAccount(userId);
        res.json({ message: "Account deleted" });
      } catch (err: any) {
        if (err.message === "User not found") {
          res.status(404).json({ error: err.message });
          return;
        }
        logger.error(err, "Delete account failed");
        res.status(500).json({ error: "Internal server error" });
      }
    },
  };
}
