import type { Request, Response } from "express";
import { logger } from "../logger";
import type { AuthService } from "../services/auth.service";
import type { AuthRequest } from "../middlewares/auth.middleware";

export function createAuthController(authService: AuthService) {
  return {
    async register(req: Request, res: Response) {
      try {
        const { email, password } = req.body;
        if (!email || !password) {
          res.status(400).json({ error: "Email and password are required" });
          return;
        }
        const data = await authService.register(email, password);
        res.status(201).json(data);
      } catch (err: any) {
        if (err.message === "Email already exists") {
          res.status(409).json({ error: err.message });
          return;
        }
        logger.error(err, "Registration failed");
        res.status(500).json({ error: "Internal server error" });
      }
    },

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

    // Protected routes — userId comes from JWT via middleware

    async verifyEmail(req: Request, res: Response) {
      try {
        const { userId } = req as AuthRequest;
        const { code } = req.body;
        if (!code) {
          res.status(400).json({ error: "Code is required" });
          return;
        }
        await authService.verifyEmail(userId, code);
        res.json({ message: "Email verified" });
      } catch (err: any) {
        if (err.message === "Invalid or expired code") {
          res.status(400).json({ error: err.message });
          return;
        }
        logger.error(err, "Email verification failed");
        res.status(500).json({ error: "Internal server error" });
      }
    },

    async resendVerification(req: Request, res: Response) {
      try {
        const { userId } = req as AuthRequest;
        await authService.sendEmailVerification(userId);
        res.json({ message: "Verification code sent" });
      } catch (err) {
        logger.error(err, "Resend verification failed");
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
