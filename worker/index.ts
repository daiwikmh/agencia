const BUILD = "shim-2";
const globals = globalThis as Record<string, unknown>;
if (!globals.window) globals.window = globals;
if (!globals.document) globals.document = { location: { href: "https://agencia.workers.dev/" } };

import { Hono } from "hono";
import { cors } from "hono/cors";
import { config, configureEnv } from "../src/config.js";
import { facilitatorName } from "../src/facilitator.js";
import { buildManifest } from "../src/service/manifest.js";
import { handleMcp } from "./mcp.js";
import { RUNNERS } from "./tools.js";
import { computeOrigin, isComputeTool } from "./compute-proxy.js";

type Bindings = Record<string, string | undefined>;

const app = new Hono<{ Bindings: Bindings }>();

app.use("*", cors({ origin: "*", allowHeaders: ["content-type", "accept", "mcp-session-id"] }));

app.use("*", async (c, next) => {
  configureEnv(c.env as Record<string, string | undefined>);
  await next();
});

const origin = (c: { req: { url: string } }) => new URL(c.req.url).origin;

app.get("/", (c) =>
  c.json({
    service: "Agencia",
    description: "Pay-per-call services on Hedera, gated by x402 and settled through Blocky402.",
    discovery: `${origin(c)}/.well-known/x402`,
    mcp: `${origin(c)}/mcp`,
    health: `${origin(c)}/health`,
    runtime: "cloudflare-workers",
  }),
);

app.get("/health", (c) =>
  c.json({
    status: "ok",
    service: "Agencia",
    network: config.network,
    x402Version: 2,
    facilitator: facilitatorName,
    payTo: config.service.payTo || null,
    hcsTopicId: config.service.hcsTopicId || null,
    runtime: "cloudflare-workers",
    build: BUILD,
    hasWindow: typeof (globalThis as Record<string, unknown>).window !== "undefined",
  }),
);

app.get("/.well-known/x402", (c) => {
  const manifest = buildManifest(origin(c));
  return c.json({
    ...manifest,
    resources: manifest.resources.filter((r) => RUNNERS[r.tool] || (computeOrigin() && isComputeTool(r.tool))),
    compute: computeOrigin()
      ? { available: true, servedBy: "supplier-backed origin" }
      : {
          available: false,
          status: "pending",
          note: "Compute requests are accepted and answered with a pending status until a compute origin is attached. No payment is taken for a pending lease.",
        },
  });
});

app.all("/mcp", async (c) => handleMcp(c.req.raw, origin(c)));

app.get("/diagnostics", (c) =>
  c.json({
    build: BUILD,
    windowShim: typeof (globalThis as Record<string, unknown>).window !== "undefined",
    hcsConfigured: !!config.service.hcsTopicId && !!config.service.operatorKey,
    inferenceConfigured: !!config.nim.apiKey,
    payTo: config.service.payTo || null,
  }),
);

export default app;
