import { Hono } from "hono";
import { buildManifest } from "../../manifest.js";
import { requestOrigin } from "../origin.js";

export const manifest = new Hono();

manifest.get("/.well-known/x402", (c) => c.json(buildManifest(requestOrigin(c.req.raw))));
