import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { config } from "../../config.js";
import type { Payout } from "./payouts.js";
import { payoutSupplier } from "./payouts.js";
import { providerById, route } from "./registry.js";
import { recordSupplierLease, recordSupplierSale, supplierById } from "./suppliers.js";
import type { ExecResult, SandboxHandle, SandboxSpec } from "./types.js";

export type LeaseStatus = "running" | "expired" | "closed";

export interface LeaseExec {
  command: string;
  exitCode: number;
  durationMs: number;
  at: string;
}

export interface Lease {
  id: string;
  token: string;
  owner: string | null;
  agent: string | null;
  provider: string;
  providerLabel: string;
  handle: SandboxHandle;
  spec: SandboxSpec;
  ratePerSecondHbar: number;
  providerRatePerSecondHbar: number;
  tickSeconds: number;
  status: LeaseStatus;
  openedAt: number;
  expiresAt: number;
  secondsPurchased: number;
  ticks: number;
  hbarPaid: number;
  execs: LeaseExec[];
  execMs: number;
  payout?: Payout;
}

const leases = new Map<string, Lease>(load().map((l) => [l.id, l]));

function load(): Lease[] {
  try {
    return JSON.parse(readFileSync(config.compute.leaseStore, "utf8")) as Lease[];
  } catch {
    return [];
  }
}

function persist() {
  try {
    mkdirSync(dirname(config.compute.leaseStore), { recursive: true });
    writeFileSync(config.compute.leaseStore, JSON.stringify([...leases.values()], null, 2));
  } catch {
    return;
  }
}

export interface OpenLeaseInput {
  seconds: number;
  cpu: number;
  memMb: number;
  image?: string;
  provider?: string;
  paidHbar: number;
  ratePerSecondHbar: number;
  owner?: string | null;
  agent?: string | null;
  writable?: boolean;
}

export async function openLease(input: OpenLeaseInput): Promise<Lease> {
  const spec: SandboxSpec = {
    cpu: input.cpu,
    memMb: input.memMb,
    ttlSeconds: input.seconds,
    image: input.image ?? config.compute.image,
    writable: input.writable ?? false,
  };
  const { provider, ratePerSecondHbar } = await route(spec, input.provider);
  const id = randomUUID().slice(0, 12);
  const handle = await provider.start(spec, id);
  const now = Date.now();

  const lease: Lease = {
    id,
    token: randomUUID().replace(/-/g, ""),
    owner: input.owner ?? null,
    agent: input.agent ?? null,
    provider: provider.id,
    providerLabel: provider.label,
    handle,
    spec,
    ratePerSecondHbar: input.ratePerSecondHbar,
    providerRatePerSecondHbar: ratePerSecondHbar,
    tickSeconds: config.compute.tickSeconds,
    status: "running",
    openedAt: now,
    expiresAt: now + input.seconds * 1000,
    secondsPurchased: input.seconds,
    ticks: 0,
    hbarPaid: input.paidHbar,
    execs: [],
    execMs: 0,
  };
  leases.set(id, lease);
  persist();
  if (supplierById(provider.id)) recordSupplierLease(provider.id);
  return lease;
}

export function getLease(id: string): Lease | undefined {
  return leases.get(id);
}

export function tickPriceHbar(leaseId: string): number {
  const lease = leases.get(leaseId);
  const rate = lease?.ratePerSecondHbar ?? config.compute.localRatePerSecondHbar;
  const cpu = lease?.spec.cpu ?? 1;
  return rate * config.compute.tickSeconds * cpu;
}

export class LeaseAccessError extends Error {}

export function authorize(id: string, credential?: string | null): Lease {
  const lease = leases.get(id);
  if (!lease) throw new LeaseAccessError(`unknown lease ${id}`);
  if (!lease.owner && !lease.token) return lease;
  const presented = credential ?? "";
  if (presented === lease.token) return lease;
  if (lease.owner && presented === lease.owner) return lease;
  throw new LeaseAccessError(
    `lease ${id} belongs to another account — present its lease token or pay from ${lease.owner ?? "its owner"}`,
  );
}

export function liveLease(id: string, credential?: string | null): Lease {
  const lease = authorize(id, credential);
  if (lease.status !== "running") throw new Error(`lease ${id} is ${lease.status}`);
  if (Date.now() > lease.expiresAt) throw new Error(`lease ${id} expired — pay a tick to extend`);
  return lease;
}

export async function execInLease(
  id: string,
  command: string,
  credential?: string | null,
): Promise<ExecResult> {
  const lease = liveLease(id, credential);
  const provider = providerById(lease.provider);
  if (!provider) throw new Error(`provider ${lease.provider} is gone`);

  const budgetMs = Math.max(1000, Math.min(config.compute.execTimeoutMs, lease.expiresAt - Date.now()));
  const result = await provider.exec(lease.handle, command, budgetMs);

  lease.execMs += result.durationMs;
  lease.execs.push({
    command,
    exitCode: result.exitCode,
    durationMs: result.durationMs,
    at: new Date().toISOString(),
  });
  persist();
  return result;
}

export async function tickLease(id: string, paidHbar: number, payer?: string | null): Promise<Lease> {
  const lease = leases.get(id);
  if (!lease) throw new Error(`unknown lease ${id}`);
  if (lease.status === "closed") throw new Error(`lease ${id} is closed`);
  if (lease.owner && payer && payer !== lease.owner) {
    throw new LeaseAccessError(`lease ${id} is owned by ${lease.owner}`);
  }

  const provider = providerById(lease.provider);
  if (!provider) throw new Error(`provider ${lease.provider} is gone`);

  const base = Math.max(Date.now(), lease.expiresAt);
  if (base - Date.now() + lease.tickSeconds * 1000 > config.compute.maxLeaseSeconds * 1000) {
    throw new Error(`lease ${id} would exceed the ${config.compute.maxLeaseSeconds}s cap`);
  }

  await provider.extend(lease.handle, lease.tickSeconds);
  lease.expiresAt = base + lease.tickSeconds * 1000;
  lease.secondsPurchased += lease.tickSeconds;
  lease.ticks += 1;
  lease.hbarPaid += paidHbar;
  lease.status = "running";
  persist();
  return lease;
}

export async function closeLease(id: string, credential?: string | null): Promise<Lease> {
  const lease = authorize(id, credential);
  if (lease.status !== "closed") {
    const provider = providerById(lease.provider);
    await provider?.stop(lease.handle);
    lease.status = "closed";
    if (supplierById(lease.provider) && !lease.payout) {
      recordSupplierSale(lease.provider, lease.secondsPurchased, lease.hbarPaid);
      lease.payout = (await payoutSupplier(lease.provider, lease.hbarPaid, lease.id)) ?? undefined;
    }
    persist();
  }
  return lease;
}

export function leaseSummary(lease: Lease, includeToken = false) {
  const elapsedSeconds = Math.round((Math.min(Date.now(), lease.expiresAt) - lease.openedAt) / 1000);
  return {
    leaseId: lease.id,
    owner: lease.owner,
    agent: lease.agent,
    provider: lease.provider,
    providerLabel: lease.providerLabel,
    status: lease.status,
    cpu: lease.spec.cpu,
    memMb: lease.spec.memMb,
    image: lease.spec.image,
    writable: lease.spec.writable ?? false,
    ratePerSecondHbar: lease.ratePerSecondHbar,
    tickSeconds: lease.tickSeconds,
    tickHbar: Number(tickPriceHbar(lease.id).toFixed(8)),
    ticks: lease.ticks,
    secondsPurchased: lease.secondsPurchased,
    secondsElapsed: Math.max(0, elapsedSeconds),
    execCount: lease.execs.length,
    execSeconds: Number((lease.execMs / 1000).toFixed(3)),
    utilisation:
      lease.secondsPurchased > 0
        ? Number((lease.execMs / 1000 / lease.secondsPurchased).toFixed(3))
        : 0,
    hbarPaid: Number(lease.hbarPaid.toFixed(8)),
    supplierPayout: lease.payout ?? null,
    expiresAt: new Date(lease.expiresAt).toISOString(),
    ...(includeToken ? { leaseToken: lease.token } : {}),
  };
}

export function listLeases(owner?: string | null) {
  return [...leases.values()]
    .filter((l) => (owner ? l.owner === owner : true))
    .map((l) => leaseSummary(l));
}

export async function reconcile(): Promise<{ resumed: number; closed: number }> {
  let resumed = 0;
  let closed = 0;
  for (const lease of leases.values()) {
    if (lease.status === "closed") continue;
    if (Date.now() > lease.expiresAt + config.compute.graceSeconds * 1000) {
      await closeLease(lease.id, lease.token).catch(() => undefined);
      closed += 1;
    } else {
      resumed += 1;
    }
  }
  persist();
  return { resumed, closed };
}

export function liveLeaseRefs(): string[] {
  return [...leases.values()]
    .filter((l) => l.status !== "closed")
    .map((l) => l.handle.ref);
}

async function reap() {
  const now = Date.now();
  for (const lease of leases.values()) {
    if (lease.status === "closed") continue;
    if (now > lease.expiresAt + config.compute.graceSeconds * 1000) {
      lease.status = "expired";
      await closeLease(lease.id, lease.token).catch(() => undefined);
    }
  }
}

setInterval(() => void reap(), 5000).unref();
