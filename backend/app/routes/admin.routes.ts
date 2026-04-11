import { Router } from "express";
import type { AdminService } from "../services/admin.service";
import { createAdminController } from "../controllers/admin.controller";
import { authMiddleware, adminMiddleware } from "../middlewares/auth.middleware";

export function adminRoutes(adminService: AdminService) {
  const router = Router();
  const controller = createAdminController(adminService);

  router.use(authMiddleware, adminMiddleware);

  router.post("/users", controller.createUser);
  router.get("/users", controller.listUsers);

  return router;
}
