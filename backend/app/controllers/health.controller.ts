import type { Request, Response } from "express";
import { logger } from "../logger";
import type { HealthService } from "../services/health.service";

export function createHealthController(healthService: HealthService) {
  return {
    async check(_req: Request, res: Response) {
      try {
        const data = await healthService.check();
        res.json(data);
      } catch (err) {
        logger.error(err, "Health check failed");
        res.status(500).json({ status: "error", message: String(err) });
      }
    },
  };
}
