import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { config } from "../../config.js";

export type SupplierStatus = "pending" | "allowlisted" | "suspended";

export interface Supplier {
  id: string;
  label: string;
  endpoint: string;
  token: string;
  payoutAccountId: string;
  ratePerSecondHbar: number;
  region: string;
  maxCpu: number;
  maxMemMb: number;
  gpu: boolean;
  status: SupplierStatus;
  registeredAt: string;
  leases: number;
  secondsSold: number;
  hbarEarned: number;
  hbarPaidOut: number;
}

export interface SupplierRegistration {
  label: string;
  endpoint: string;
  token: string;
  payoutAccountId: string;
  ratePerSecondHbar: number;
  region?: string;
  maxCpu?: number;
  maxMemMb?: number;
  gpu?: boolean;
}

let suppliers: Supplier[] = load();

function load(): Supplier[] {
  try {
    return JSON.parse(readFileSync(config.compute.supplierStore, "utf8")) as Supplier[];
  } catch {
    return [];
  }
}

function persist() {
  try {
    mkdirSync(dirname(config.compute.supplierStore), { recursive: true });
    writeFileSync(config.compute.supplierStore, JSON.stringify(suppliers, null, 2));
  } catch {
    return;
  }
}

function keepsStanding(
  existing: Supplier | undefined,
  input: SupplierRegistration,
): existing is Supplier {
  return (
    !!existing &&
    existing.payoutAccountId === input.payoutAccountId &&
    existing.endpoint === input.endpoint.replace(/\/$/, "")
  );
}

export function registerSupplier(input: SupplierRegistration): Supplier {
  if (!/^https?:\/\//.test(input.endpoint)) throw new Error("endpoint must be an http(s) URL");
  if (!/^\d+\.\d+\.\d+$/.test(input.payoutAccountId)) {
    throw new Error("payoutAccountId must be a Hedera account id like 0.0.1234");
  }
  if (!(input.ratePerSecondHbar > 0)) throw new Error("ratePerSecondHbar must be greater than zero");
  if (!input.token || input.token.length < 16) throw new Error("token must be at least 16 chars");

  const existing = suppliers.find((s) => s.endpoint === input.endpoint);
  const supplier: Supplier = {
    id: existing?.id ?? `sup_${randomUUID().slice(0, 8)}`,
    label: input.label || input.endpoint,
    endpoint: input.endpoint.replace(/\/$/, ""),
    token: input.token,
    payoutAccountId: input.payoutAccountId,
    ratePerSecondHbar: input.ratePerSecondHbar,
    region: input.region ?? "unknown",
    maxCpu: Math.min(input.maxCpu ?? config.compute.maxCpu, config.compute.maxCpu),
    maxMemMb: Math.min(input.maxMemMb ?? config.compute.maxMemMb, config.compute.maxMemMb),
    gpu: input.gpu ?? false,
    status: keepsStanding(existing, input)
      ? existing.status
      : config.compute.autoApprove
        ? "allowlisted"
        : "pending",
    registeredAt: existing?.registeredAt ?? new Date().toISOString(),
    leases: existing?.leases ?? 0,
    secondsSold: existing?.secondsSold ?? 0,
    hbarEarned: existing?.hbarEarned ?? 0,
    hbarPaidOut: existing?.hbarPaidOut ?? 0,
  };

  suppliers = [...suppliers.filter((s) => s.id !== supplier.id), supplier];
  persist();
  return supplier;
}

export function setSupplierStatus(id: string, status: SupplierStatus): Supplier {
  const supplier = suppliers.find((s) => s.id === id);
  if (!supplier) throw new Error(`unknown supplier ${id}`);
  supplier.status = status;
  persist();
  return supplier;
}

export function allowlisted(): Supplier[] {
  return suppliers.filter((s) => s.status === "allowlisted");
}

export function listSuppliers(): Supplier[] {
  return suppliers;
}

export function supplierById(id: string): Supplier | undefined {
  return suppliers.find((s) => s.id === id);
}

export function recordSupplierSale(id: string, seconds: number, hbar: number) {
  const supplier = suppliers.find((s) => s.id === id);
  if (!supplier) return;
  supplier.secondsSold += seconds;
  supplier.hbarEarned += hbar;
  persist();
}

export function recordSupplierLease(id: string) {
  const supplier = suppliers.find((s) => s.id === id);
  if (!supplier) return;
  supplier.leases += 1;
  persist();
}

export function recordSupplierPayout(id: string, hbar: number) {
  const supplier = suppliers.find((s) => s.id === id);
  if (!supplier) return;
  supplier.hbarPaidOut += hbar;
  persist();
}

export function publicSupplier(s: Supplier) {
  return {
    id: s.id,
    label: s.label,
    region: s.region,
    gpu: s.gpu,
    maxCpu: s.maxCpu,
    maxMemMb: s.maxMemMb,
    ratePerSecondHbar: s.ratePerSecondHbar,
    status: s.status,
    payoutAccountId: s.payoutAccountId,
    leases: s.leases,
    secondsSold: s.secondsSold,
    hbarEarned: Number(s.hbarEarned.toFixed(8)),
    hbarPaidOut: Number(s.hbarPaidOut.toFixed(8)),
    registeredAt: s.registeredAt,
  };
}
