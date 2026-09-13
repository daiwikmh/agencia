import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { config } from "../../../config.js";
import type { ComputeProvider, ExecResult, SandboxHandle, SandboxSpec } from "../types.js";

const run = promisify(execFile);

async function docker(args: string[], timeoutMs = 30_000) {
  return run("docker", args, { timeout: timeoutMs, maxBuffer: 8 * 1024 * 1024 });
}

export async function sweepOrphans(keepNames: string[] = []): Promise<number> {
  try {
    const { stdout } = await docker(
      ["ps", "-a", "--filter", "label=agencia.lease=1", "--format", "{{.Names}}"],
      8000,
    );
    const keep = new Set(keepNames);
    const names = stdout.trim().split("\n").filter(Boolean).filter((n) => !keep.has(n));
    if (!names.length) return 0;
    await docker(["rm", "-f", ...names], 30_000);
    return names.length;
  } catch {
    return 0;
  }
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
    const hardened = spec.writable
      ? ["--user", "0:0"]
      : [
          "--read-only",
          "--tmpfs",
          "/home/node:rw,exec,size=128m",
          "--user",
          "1000:1000",
        ];
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
      "--tmpfs",
      "/tmp:rw,exec,size=64m",
      ...hardened,
      "--network",
      config.compute.network,
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

  async capacity() {
    try {
      const { stdout } = await docker(
        ["info", "--format", "{{.NCPU}}|{{.MemTotal}}|{{.ServerVersion}}"],
        6000,
      );
      const [cpus, mem, version] = stdout.trim().split("|");
      const running = await docker(
        ["ps", "--filter", "label=agencia.lease=1", "--format", "{{.Names}}"],
        6000,
      );
      return {
        cpus: Number(cpus) || null,
        memMb: mem ? Math.round(Number(mem) / 1024 / 1024) : null,
        runtime: version ? `docker ${version}` : null,
        busyLeases: running.stdout.trim() ? running.stdout.trim().split("\n").length : 0,
      };
    } catch {
      return null;
    }
  },

  async stop(handle) {
    await docker(["rm", "-f", handle.ref], 20_000).catch(() => undefined);
  },
};
