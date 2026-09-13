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
import { computeOrigin, computeReachable, isComputeTool } from "./compute-proxy.js";
import { mcpInstructions } from "../src/service/banner.js";

type Bindings = Record<string, string | undefined>;

const app = new Hono<{ Bindings: Bindings }>();

app.use("*", cors({ origin: "*", allowHeaders: ["content-type", "accept", "mcp-session-id"] }));

app.use("*", async (c, next) => {
  configureEnv(c.env as Record<string, string | undefined>);
  await next();
});

const origin = (c: { req: { url: string } }) => new URL(c.req.url).origin;

app.get("/", (c) => {
  const wantsText = (c.req.header("accept") ?? "").includes("text/plain") ||
    /^curl\//i.test(c.req.header("user-agent") ?? "");
  if (wantsText) {
    return c.text(mcpInstructions(origin(c), RUNNERS ? Object.keys(RUNNERS).length : 0));
  }
  return c.json({
    service: "Agencia",
    description: "Pay-per-call services on Hedera, gated by x402 and settled through Blocky402.",
    discovery: `${origin(c)}/.well-known/x402`,
    mcp: `${origin(c)}/mcp`,
    health: `${origin(c)}/health`,
    runtime: "cloudflare-workers",
  });
});

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

app.get("/.well-known/x402", async (c) => {
  const manifest = buildManifest(origin(c));
  const live = await computeReachable();
  return c.json({
    ...manifest,
    resources: manifest.resources.filter((r) => RUNNERS[r.tool] || (live && isComputeTool(r.tool))),
    compute: live
      ? { available: true, servedBy: "supplier-backed origin" }
      : {
          available: false,
          status: "pending",
          note: computeOrigin()
            ? "A compute origin is configured but not answering right now. Lease requests are accepted with a pending status and take no payment."
            : "No compute origin is attached to this endpoint. Lease requests are accepted with a pending status and take no payment.",
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
