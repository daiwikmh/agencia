import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { promisify } from "node:util";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { config } from "../src/config.js";

const run = promisify(execFile);
const docker = (args: string[], timeoutMs = 30_000) =>
  run("docker", args, { timeout: timeoutMs, maxBuffer: 8 * 1024 * 1024 });

const PORT = Number(process.env.SUPPLIER_PORT ?? 3099);
const TOKEN = process.env.SUPPLIER_TOKEN ?? randomUUID().replace(/-/g, "");
const PAYOUT = process.env.SUPPLIER_PAYOUT_ACCOUNT_ID ?? config.agent.accountId;
const RATE = Number(process.env.SUPPLIER_RATE_PER_SECOND_HBAR ?? 0.0004);
const LABEL = process.env.SUPPLIER_LABEL ?? "independent supplier";
const REGION = process.env.SUPPLIER_REGION ?? "local";
const HUB = process.env.AGENCIA_SERVICE_URL ?? config.agent.serviceUrl;

const app = new Hono();

app.use("*", async (c, next) => {
  if (c.req.path === "/health") return next();
  if (c.req.header("authorization") !== `Bearer ${TOKEN}`) return c.json({ error: "unauthorized" }, 401);
  return next();
});

app.get("/health", (c) => c.json({ ok: true, label: LABEL, region: REGION }));

app.post("/sandboxes", async (c) => {
  const spec = await c.req.json<{ leaseId: string; cpu: number; memMb: number; image: string }>();
  const name = `supplier-${spec.leaseId}`;
  await docker([
    "run",
    "-d",
    "--name",
    name,
    "--cpus",
    String(spec.cpu),
    "--memory",
    `${spec.memMb}m`,
    "--pids-limit",
    "256",
    "--cap-drop",
    "ALL",
    "--security-opt",
    "no-new-privileges",
    "--read-only",
    "--tmpfs",
    "/tmp:rw,exec,size=64m",
    "--tmpfs",
    "/home/node:rw,exec,size=128m",
    "--user",
    "1000:1000",
    "--workdir",
    "/home/node",
    spec.image,
    "sleep",
    "3600",
  ]);
  return c.json({ id: name });
});

app.post("/sandboxes/:id/exec", async (c) => {
  const { command, timeoutMs } = await c.req.json<{ command: string; timeoutMs: number }>();
  const started = Date.now();
  try {
    const { stdout, stderr } = await docker(
      ["exec", c.req.param("id"), "sh", "-lc", command],
      timeoutMs,
    );
    return c.json({ exitCode: 0, stdout, stderr, durationMs: Date.now() - started });
  } catch (err) {
    const e = err as { code?: number; stdout?: string; stderr?: string };
    return c.json({
      exitCode: typeof e.code === "number" ? e.code : 1,
      stdout: e.stdout ?? "",
      stderr: e.stderr ?? String(err),
      durationMs: Date.now() - started,
    });
  }
});

app.post("/sandboxes/:id/extend", (c) => c.json({ ok: true }));

app.delete("/sandboxes/:id", async (c) => {
  await docker(["rm", "-f", c.req.param("id")], 20_000).catch(() => undefined);
  return c.json({ ok: true });
});

async function registerWithHub(endpoint: string) {
  const res = await fetch(`${HUB}/providers/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      label: LABEL,
      endpoint,
      token: TOKEN,
      payoutAccountId: PAYOUT,
      ratePerSecondHbar: RATE,
      region: REGION,
      maxCpu: Number(process.env.SUPPLIER_MAX_CPU ?? 2),
      maxMemMb: Number(process.env.SUPPLIER_MAX_MEM_MB ?? 1024),
      gpu: process.env.SUPPLIER_GPU === "true",
    }),
  });
  return res.json();
}

serve({ fetch: app.fetch, port: PORT }, async (info) => {
  const endpoint = process.env.SUPPLIER_ENDPOINT ?? `http://localhost:${info.port}`;
  console.log(`[supplier] ${LABEL} serving on ${endpoint}`);
  console.log(`[supplier] asking ${RATE} HBAR per vCPU-second, payout to ${PAYOUT}`);
  try {
    const result = await registerWithHub(endpoint);
    console.log(`[supplier] registered with ${HUB}:`, JSON.stringify(result, null, 2));
  } catch (err) {
    console.error(`[supplier] registration failed:`, err);
  }
});
