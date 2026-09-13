import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { config } from "../../../config.js";
import { catalogEntry, priceFor } from "../../catalog.js";
import {
  closeLease,
  execInLease,
  getLease,
  leaseSummary,
  listLeases,
  openLease,
  tickLease,
  tickPriceHbar,
} from "../../compute/leases.js";
import { listProviders, marketplace, route } from "../../compute/registry.js";
import { registerPaidTool } from "../../payments/paid-tool.js";

function jsonResult(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

function errorResult(err: unknown) {
  return {
    isError: true,
    content: [{ type: "text" as const, text: String(err instanceof Error ? err.message : err) }],
  };
}

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

export function registerComputeTools(server: McpServer): void {
  const lease = catalogEntry("compute_lease");
  if (lease) {
    registerPaidTool(server, {
      name: lease.name,
      description: lease.description,
      inputSchema: {
        seconds: z.number().int().min(10).max(config.compute.maxLeaseSeconds).default(60),
        cpu: z.number().min(0.5).max(config.compute.maxCpu).default(1),
        memMb: z.number().int().min(128).max(config.compute.maxMemMb).default(512),
        image: z.string().optional().describe("Container image, defaults to the service image"),
        provider: z.string().default("auto").describe("Provider id, or auto for cheapest available"),
      },
      price: (args) => priceFor(lease.name, args),
      run: async (args) => {
        const seconds = clamp(Number(args.seconds ?? 60), 10, config.compute.maxLeaseSeconds);
        const cpu = clamp(Number(args.cpu ?? 1), 0.5, config.compute.maxCpu);
        const memMb = clamp(Number(args.memMb ?? 512), 128, config.compute.maxMemMb);
        try {
          const opened = await openLease({
            seconds,
            cpu,
            memMb,
            image: args.image ? String(args.image) : undefined,
            provider: args.provider ? String(args.provider) : "auto",
            paidHbar: priceFor(lease.name, { seconds, cpu }),
            ratePerSecondHbar: lease.pricing.perSecondHbar ?? 0,
          });
          return jsonResult({
            ...leaseSummary(opened),
            next: {
              exec: "compute_exec { leaseId, command } — covered by the lease",
              tick: `compute_tick { leaseId } — ${tickPriceHbar(opened.id).toFixed(8)} HBAR per ${opened.tickSeconds}s`,
              end: "compute_end { leaseId }",
            },
          });
        } catch (err) {
          return errorResult(err);
        }
      },
    });
  }

  const tick = catalogEntry("compute_tick");
  if (tick) {
    registerPaidTool(server, {
      name: tick.name,
      description: tick.description,
      inputSchema: { leaseId: z.string().describe("Lease id returned by compute_lease") },
      price: (args) => tickPriceHbar(String(args.leaseId ?? "")),
      run: async (args) => {
        const id = String(args.leaseId ?? "");
        try {
          const ticked = await tickLease(id, tickPriceHbar(id));
          return jsonResult(leaseSummary(ticked));
        } catch (err) {
          return errorResult(err);
        }
      },
    });
  }

  server.tool(
    "compute_exec",
    "Run a shell command inside a live lease. Covered by the lease — no payment, execution time is metered onto the lease receipt.",
    {
      leaseId: z.string().describe("Lease id returned by compute_lease"),
      command: z.string().describe("Shell command to run inside the sandbox"),
    },
    async (args) => {
      try {
        const result = await execInLease(String(args.leaseId), String(args.command));
        const current = getLease(String(args.leaseId));
        return jsonResult({
          ...result,
          lease: current ? leaseSummary(current) : null,
        });
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.tool(
    "compute_end",
    "Close a lease, stop the sandbox and return the metered session summary.",
    { leaseId: z.string().describe("Lease id returned by compute_lease") },
    async (args) => {
      try {
        const closed = await closeLease(String(args.leaseId));
        return jsonResult(leaseSummary(closed));
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.tool(
    "compute_providers",
    "List the compute providers this service can route a lease to, with their per-second cost basis and availability.",
    {
      cpu: z.number().min(0.5).max(config.compute.maxCpu).default(1),
      memMb: z.number().int().min(128).max(config.compute.maxMemMb).default(512),
    },
    async (args) => {
      const spec = {
        cpu: Number(args.cpu ?? 1),
        memMb: Number(args.memMb ?? 512),
        ttlSeconds: config.compute.tickSeconds,
        image: config.compute.image,
      };
      try {
        const routed = await route(spec);
        const market = await marketplace(spec.cpu, spec.memMb);
        return jsonResult({
          listRatePerSecondHbar: catalogEntry("compute_lease")?.pricing.perSecondHbar ?? 0,
          tickSeconds: config.compute.tickSeconds,
          maxLeaseSeconds: config.compute.maxLeaseSeconds,
          registered: listProviders().map((p) => ({ id: p.id, label: p.label, region: p.region })),
          considered: routed.considered,
          wouldRouteTo: routed.provider.id,
          ...market,
          leases: listLeases(),
        });
      } catch (err) {
        return errorResult(err);
      }
    },
  );
}
