import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { logger } from "hono/logger";
import { config } from "../../config.js";
import { sweepOrphans } from "../compute/providers/local.js";
import { liveLeaseRefs, reconcile } from "../compute/leases.js";
import { announceService } from "../registry/announce.js";
import { bootBanner } from "../banner.js";
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
    console.log(bootBanner(info.port));
    console.log(`  facilitator  ${facilitatorName}`);
    if (config.registry.topicId && config.registry.announceOnBoot) {
      void announceService(`http://localhost:${info.port}`).then((r) => {
        if (r) console.log(`  announced   on registry topic ${r.topicId} #${r.sequenceNumber}`);
      });
    }

    void reconcile().then(({ resumed, closed }) => {
      if (resumed || closed) {
        console.log(`  leases      ${resumed} resumed, ${closed} expired on restart`);
      }
      if (config.compute.providers.includes("local")) {
        void sweepOrphans(liveLeaseRefs()).then((n) => {
          if (n > 0) console.log(`  swept       ${n} orphaned lease container(s)`);
        });
      }
    });
  });
}
