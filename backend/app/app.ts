import express from "express";
import pinoHttp from "pino-http";
import { logger } from "./logger";
import { createRouter } from "./routes/index";

export function createApp() {
  const app = express();

  app.use(express.json());
  app.use(pinoHttp({ logger }));
  app.use(createRouter());

  return app;
}
