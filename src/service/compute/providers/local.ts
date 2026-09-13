import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { config } from "../../../config.js";
import type { ComputeProvider, ExecResult, SandboxHandle, SandboxSpec } from "../types.js";

const run = promisify(execFile);

async function docker(args: string[], timeoutMs = 30_000) {
  return run("docker", args, { timeout: timeoutMs, maxBuffer: 8 * 1024 * 1024 });
}

export const localProvider: ComputeProvider = {
  id: "local",
  label: "Agencia bare metal (container)",
  region: config.compute.region,

  async available() {
    try {
      await docker(["version", "--format", "{{.Server.Version}}"], 4000);
      return true;
    } catch {
      return false;
    }
  },

  costPerSecondHbar(spec) {
    return config.compute.localRatePerSecondHbar * spec.cpu;
  },

  async start(spec, leaseId) {
    const name = `agencia-${leaseId}`;
    await docker([
      "run",
      "-d",
      "--name",
      name,
      "--cpus",
      String(spec.cpu),
      "--memory",
      `${spec.memMb}m`,
      "--memory-swap",
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
      "--network",
      config.compute.network,
      "--user",
      "1000:1000",
      "--workdir",
      "/home/node",
      "--label",
      "agencia.lease=1",
      spec.image,
      "sleep",
      String(config.compute.maxLeaseSeconds + 120),
    ]);
    return { provider: this.id, ref: name };
  },

  async exec(handle, command, timeoutMs) {
    const started = Date.now();
    try {
      const { stdout, stderr } = await docker(
        ["exec", handle.ref, "sh", "-lc", command],
        timeoutMs,
      );
      return { exitCode: 0, stdout, stderr, durationMs: Date.now() - started };
    } catch (err) {
      const e = err as { code?: number; stdout?: string; stderr?: string; killed?: boolean };
      return {
        exitCode: typeof e.code === "number" ? e.code : 1,
        stdout: e.stdout ?? "",
        stderr: e.killed ? `timed out after ${timeoutMs}ms` : (e.stderr ?? String(err)),
        durationMs: Date.now() - started,
      };
    }
  },

  async extend() {},

  async stop(handle) {
    await docker(["rm", "-f", handle.ref], 20_000).catch(() => undefined);
  },
};
