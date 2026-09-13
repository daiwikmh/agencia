import { config } from "../../config.js";
import { hbarPrice } from "../capabilities/price.js";
import { PROVIDER_DIRECTORY, usdPerSecond } from "./directory.js";
import { allowlisted, listSuppliers, publicSupplier } from "./suppliers.js";
import { localProvider } from "./providers/local.js";
import { remoteProvider } from "./providers/remote.js";
import type { ComputeProvider, SandboxSpec } from "./types.js";

const staticProviders: ComputeProvider[] = [
  ...(config.compute.providers.includes("local") ? [localProvider] : []),
  ...config.compute.remotes.map(remoteProvider),
];

function supplierProviders(): ComputeProvider[] {
  return allowlisted().map((s) =>
    remoteProvider({
      id: s.id,
      label: s.label,
      baseUrl: s.endpoint,
      token: s.token,
      ratePerSecondHbar: s.ratePerSecondHbar,
      region: s.region,
    }),
  );
}

export function listProviders(): ComputeProvider[] {
  return [...staticProviders, ...supplierProviders()];
}

export function providerById(id: string): ComputeProvider | undefined {
  return listProviders().find((p) => p.id === id);
}

let hbarUsd: { price: number; at: number } | null = null;

async function hbarUsdPrice(): Promise<number | null> {
  if (config.compute.hbarUsd > 0) return config.compute.hbarUsd;
  if (hbarUsd && Date.now() - hbarUsd.at < 300_000) return hbarUsd.price;
  try {
    const quote = await hbarPrice("usd");
    hbarUsd = { price: quote.price, at: Date.now() };
    return quote.price;
  } catch {
    return hbarUsd?.price ?? null;
  }
}

export async function marketplace(cpu: number, memMb: number) {
  const usdPerHbar = await hbarUsdPrice();
  const configured = new Set(listProviders().map((p) => p.id));

  return {
    hbarUsd: usdPerHbar,
    suppliers: listSuppliers().map(publicSupplier),
    directory: PROVIDER_DIRECTORY.map((entry) => {
      const usd = usdPerSecond(entry, cpu, memMb);
      return {
        id: entry.id,
        label: entry.label,
        kind: entry.kind,
        billing: entry.billing,
        gpu: entry.gpu,
        adapter: entry.adapter,
        docs: entry.docs,
        note: entry.note,
        costUsdPerSecond: usd,
        costHbarPerSecond:
          usd != null && usdPerHbar ? Number((usd / usdPerHbar).toFixed(8)) : null,
        status: configured.has(entry.id) ? "configured" : "not-configured",
      };
    }),
  };
}

export async function inventory(cpu: number, memMb: number) {
  const spec: SandboxSpec = { cpu, memMb, ttlSeconds: config.compute.tickSeconds, image: config.compute.image };
  const suppliers = new Map(allowlisted().map((s) => [s.id, s]));

  const providers = await Promise.all(
    listProviders().map(async (p) => {
      const supplier = suppliers.get(p.id);
      return {
        id: p.id,
        label: p.label,
        region: p.region ?? "unknown",
        kind: supplier ? "supplier" : p.id === "local" ? "first-party" : "configured",
        available: await p.available(),
        costPerSecondHbar: p.costPerSecondHbar(spec),
        capacity: p.capacity ? await p.capacity() : null,
        maxCpu: supplier?.maxCpu ?? config.compute.maxCpu,
        maxMemMb: supplier?.maxMemMb ?? config.compute.maxMemMb,
        gpu: supplier?.gpu ?? false,
        payoutAccountId: supplier?.payoutAccountId ?? null,
      };
    }),
  );

  return {
    listRatePerSecondHbar: config.compute.localRatePerSecondHbar,
    openFeeHbar: config.compute.openFeeHbar,
    tickSeconds: config.compute.tickSeconds,
    maxLeaseSeconds: config.compute.maxLeaseSeconds,
    image: config.compute.image,
    providers,
  };
}

export interface RouteResult {
  provider: ComputeProvider;
  ratePerSecondHbar: number;
  considered: { id: string; ratePerSecondHbar: number; available: boolean }[];
}

export async function route(spec: SandboxSpec, prefer?: string): Promise<RouteResult> {
  const providers = listProviders();
  const considered = await Promise.all(
    providers.map(async (p) => ({
      id: p.id,
      ratePerSecondHbar: p.costPerSecondHbar(spec),
      available: await p.available(),
    })),
  );

  const pick = (id: string) => providers.find((p) => p.id === id);

  if (prefer && prefer !== "auto") {
    const chosen = pick(prefer);
    const info = considered.find((c) => c.id === prefer);
    if (!chosen || !info?.available) {
      throw new Error(`compute provider "${prefer}" is not available`);
    }
    return { provider: chosen, ratePerSecondHbar: info.ratePerSecondHbar, considered };
  }

  const cheapest = considered
    .filter((c) => c.available)
    .sort((a, b) => a.ratePerSecondHbar - b.ratePerSecondHbar)[0];
  if (!cheapest) throw new Error("no compute provider is currently available");

  return {
    provider: pick(cheapest.id)!,
    ratePerSecondHbar: cheapest.ratePerSecondHbar,
    considered,
  };
}
