import { Hono } from "hono";
import { config } from "../../../config.js";
import { facilitatorName } from "../../../facilitator.js";

export const health = new Hono();

health.get("/health", (c) =>
  c.json({
    status: "ok",
    service: "Agencia",
    network: config.network,
    x402Version: 2,
    facilitator: facilitatorName,
    payTo: config.service.payTo || null,
    hcsTopicId: config.service.hcsTopicId || null,
  }),
);
