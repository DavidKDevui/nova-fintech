import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import { logger } from "./logger";
import { createRouter } from "./routes/index";

export function createApp() {
  const app = express();

  app.use(cors({
    origin: process.env.FRONTEND_URL || "http://localhost:3001",
    credentials: true,
  }));
  app.use(cookieParser());
  app.use(express.json());
  app.use(pinoHttp({ logger }));
  app.use(createRouter());

  app.use((_req, res) => {
    res.status(404).json({ error: "Not found" });
  });

  return app;
}
