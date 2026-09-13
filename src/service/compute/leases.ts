import { randomUUID } from "node:crypto";
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

const leases = new Map<string, Lease>();

export interface OpenLeaseInput {
  seconds: number;
  cpu: number;
  memMb: number;
  image?: string;
  provider?: string;
  paidHbar: number;
  ratePerSecondHbar: number;
}

export async function openLease(input: OpenLeaseInput): Promise<Lease> {
  const spec: SandboxSpec = {
    cpu: input.cpu,
    memMb: input.memMb,
    ttlSeconds: input.seconds,
    image: input.image ?? config.compute.image,
  };
  const { provider, ratePerSecondHbar } = await route(spec, input.provider);
  const id = randomUUID().slice(0, 12);
  const handle = await provider.start(spec, id);
  const now = Date.now();

  const lease: Lease = {
    id,
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

export function liveLease(id: string): Lease {
  const lease = leases.get(id);
  if (!lease) throw new Error(`unknown lease ${id}`);
  if (lease.status !== "running") throw new Error(`lease ${id} is ${lease.status}`);
  if (Date.now() > lease.expiresAt) throw new Error(`lease ${id} expired — pay a tick to extend`);
  return lease;
}

export async function execInLease(id: string, command: string): Promise<ExecResult> {
  const lease = liveLease(id);
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
  return result;
}

export async function tickLease(id: string, paidHbar: number): Promise<Lease> {
  const lease = leases.get(id);
  if (!lease) throw new Error(`unknown lease ${id}`);
  if (lease.status === "closed") throw new Error(`lease ${id} is closed`);

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
  return lease;
}

export async function closeLease(id: string): Promise<Lease> {
  const lease = leases.get(id);
  if (!lease) throw new Error(`unknown lease ${id}`);
  if (lease.status !== "closed") {
    const provider = providerById(lease.provider);
    await provider?.stop(lease.handle);
    lease.status = "closed";
    if (supplierById(lease.provider) && !lease.payout) {
      recordSupplierSale(lease.provider, lease.secondsPurchased, lease.hbarPaid);
      lease.payout = (await payoutSupplier(lease.provider, lease.hbarPaid, lease.id)) ?? undefined;
    }
  }
  return lease;
}

export function leaseSummary(lease: Lease) {
  const elapsedSeconds = Math.round((Math.min(Date.now(), lease.expiresAt) - lease.openedAt) / 1000);
  return {
    leaseId: lease.id,
    provider: lease.provider,
    providerLabel: lease.providerLabel,
    status: lease.status,
    cpu: lease.spec.cpu,
    memMb: lease.spec.memMb,
    image: lease.spec.image,
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
  };
}

export function listLeases() {
  return [...leases.values()].map(leaseSummary);
}

async function reap() {
  const now = Date.now();
  for (const lease of leases.values()) {
    if (lease.status === "closed") continue;
    if (now > lease.expiresAt + config.compute.graceSeconds * 1000) {
      lease.status = "expired";
      await closeLease(lease.id).catch(() => undefined);
    }
  }
}

setInterval(() => void reap(), 5000).unref();
