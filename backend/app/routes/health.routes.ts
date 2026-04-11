import { Router } from "express";
import type { HealthService } from "../services/health.service";
import { createHealthController } from "../controllers/health.controller";

export function healthRoutes(healthService: HealthService) {
  const router = Router();
  const controller = createHealthController(healthService);

  router.get("/", controller.check);

  return router;
}
