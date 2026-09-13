import type { ComputeProvider, ExecResult, SandboxHandle, SandboxSpec } from "../types.js";

export interface RemoteProviderConfig {
  id: string;
  label: string;
  baseUrl: string;
  token: string;
  ratePerSecondHbar: number;
  region?: string;
}

async function call<T>(
  cfg: RemoteProviderConfig,
  path: string,
  init: RequestInit,
  timeoutMs = 30_000,
): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${cfg.baseUrl.replace(/\/$/, "")}${path}`, {
      ...init,
      signal: ctrl.signal,
      headers: {
        "content-type": "application/json",
        ...(cfg.token ? { authorization: `Bearer ${cfg.token}` } : {}),
        ...(init.headers as Record<string, string> | undefined),
      },
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`${cfg.id} ${res.status}: ${text.slice(0, 300)}`);
    return (text ? JSON.parse(text) : {}) as T;
  } finally {
    clearTimeout(timer);
  }
}

export function remoteProvider(cfg: RemoteProviderConfig): ComputeProvider {
  return {
    id: cfg.id,
    label: cfg.label,
    region: cfg.region,

    async available() {
      try {
        await call<{ ok?: boolean }>(cfg, "/health", { method: "GET" }, 5000);
        return true;
      } catch {
        return false;
      }
    },

    costPerSecondHbar(spec: SandboxSpec) {
      return cfg.ratePerSecondHbar * spec.cpu;
    },

    async start(spec, leaseId) {
      const body = await call<{ id: string; endpoint?: string }>(cfg, "/sandboxes", {
        method: "POST",
        body: JSON.stringify({ leaseId, ...spec }),
      });
      return { provider: cfg.id, ref: body.id, endpoint: body.endpoint };
    },

    async exec(handle, command, timeoutMs) {
      return call<ExecResult>(
        cfg,
        `/sandboxes/${encodeURIComponent(handle.ref)}/exec`,
        { method: "POST", body: JSON.stringify({ command, timeoutMs }) },
        timeoutMs + 5000,
      );
    },

    async extend(handle: SandboxHandle, seconds: number) {
      await call(cfg, `/sandboxes/${encodeURIComponent(handle.ref)}/extend`, {
        method: "POST",
        body: JSON.stringify({ seconds }),
      });
    },

    async stop(handle) {
      await call(cfg, `/sandboxes/${encodeURIComponent(handle.ref)}`, { method: "DELETE" }).catch(
        () => undefined,
      );
    },
  };
}
