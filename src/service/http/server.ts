import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { logger } from "hono/logger";
import { config } from "../../config.js";
import { facilitatorName } from "../../facilitator.js";
import { health } from "./routes/health.js";
import { manifest } from "./routes/manifest.js";
import { mcp } from "./routes/mcp.js";
import { onboard } from "./routes/onboard.js";
import { providers } from "./routes/providers.js";

export function createApp(): Hono {
  const app = new Hono();
  app.use("*", logger());
  app.route("/", health);
  app.route("/", manifest);
  app.route("/", mcp);
  app.route("/", providers);
  app.route("/", onboard);
  return app;
}

export function startServer(): void {
  const app = createApp();
  serve({ fetch: app.fetch, port: config.service.port }, (info) => {
    console.log(`Agencia x402 service on http://localhost:${info.port}`);
    console.log(`  GET  /health`);
    console.log(`  GET  /.well-known/x402`);
    console.log(`  ALL  /mcp`);
    console.log(`  GET  /providers`);
    console.log(`  POST /providers/register`);
    console.log(`  POST /onboard`);
    console.log(`  network     ${config.network}`);
    console.log(`  facilitator ${facilitatorName}`);
    console.log(`  payTo       ${config.service.payTo || "(unset)"}`);
    console.log(`  hcs topic   ${config.service.hcsTopicId || "(unset)"}`);
  });
}
