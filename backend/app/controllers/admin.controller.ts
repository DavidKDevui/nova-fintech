import type { Request, Response } from "express";
import { logger } from "../logger";
import type { AdminService } from "../services/admin.service";

export function createAdminController(adminService: AdminService) {
  return {
    async createUser(req: Request, res: Response) {
      try {
        const { email } = req.body;
        if (!email) {
          res.status(400).json({ error: "Email is required" });
          return;
        }
        const user = await adminService.createUser(email);
        res.status(201).json(user);
      } catch (err: any) {
        if (err.message === "Email already exists") {
          res.status(409).json({ error: err.message });
          return;
        }
        logger.error(err, "Create user failed");
        res.status(500).json({ error: "Internal server error" });
      }
    },

    async listUsers(_req: Request, res: Response) {
      try {
        const usersList = await adminService.listUsers();
        res.json(usersList);
      } catch (err) {
        logger.error(err, "List users failed");
        res.status(500).json({ error: "Internal server error" });
      }
    },
  };
}
