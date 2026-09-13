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
import { getIdentity } from "../../identity/accounts.js";
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
        writable: z
          .boolean()
          .default(false)
          .describe(
            "Allow installing packages into the box (apk/pip). Relaxes the read-only rootfs — opt in only if you need it.",
          ),
        provider: z.string().default("auto").describe("Provider id, or auto for cheapest available"),
      },
      price: (args) => priceFor(lease.name, args),
      run: async (args, ctx) => {
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
            owner: ctx.payer,
            agent: ctx.agent,
            writable: args.writable === true,
          });
          const identity = ctx.payer ? getIdentity(ctx.payer) : undefined;
          return jsonResult({
            ...leaseSummary(opened, true),
            ownerEmail: identity?.email ?? null,
            next: {
              exec: "compute_exec { leaseId, leaseToken, command } — covered by the lease",
              tick: `compute_tick { leaseId } — ${tickPriceHbar(opened.id).toFixed(8)} HBAR per ${opened.tickSeconds}s`,
              end: "compute_end { leaseId, leaseToken }",
              note: "Keep leaseToken — it is what authorises terminal access to this box.",
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
      run: async (args, ctx) => {
        const id = String(args.leaseId ?? "");
        try {
          const ticked = await tickLease(id, tickPriceHbar(id), ctx.payer);
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
      leaseToken: z.string().nullish().describe("Lease token proving you own this box"),
      command: z.string().describe("Shell command to run inside the sandbox"),
    },
    async (args) => {
      try {
        const result = await execInLease(
          String(args.leaseId),
          String(args.command),
          args.leaseToken ? String(args.leaseToken) : null,
        );
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
    "compute_install",
    "Install packages inside a live lease when a command is missing. Covered by the lease, but requires confirm:true — nothing is downloaded into the box without the caller agreeing.",
    {
      leaseId: z.string().describe("Lease id returned by compute_lease"),
      leaseToken: z.string().nullish().describe("Lease token proving you own this box"),
      packages: z.string().describe("Space-separated package names"),
      manager: z.enum(["auto", "apk", "npm", "pip"]).default("auto"),
      confirm: z.boolean().default(false).describe("Must be true to actually install"),
    },
    async (args) => {
      const packages = String(args.packages ?? "")
        .split(/\s+/)
        .filter((p) => /^[\w.@/+-]+$/.test(p));
      if (!packages.length) return errorResult("no valid package names given");

      const manager = String(args.manager ?? "auto");
      const resolved = manager === "auto" ? "apk" : manager;
      const command =
        resolved === "apk"
          ? `apk add --no-cache ${packages.join(" ")}`
          : resolved === "npm"
            ? `npm install -g ${packages.join(" ")}`
            : `pip install --no-cache-dir ${packages.join(" ")}`;

      if (args.confirm !== true) {
        return jsonResult({
          confirmationRequired: true,
          wouldRun: command,
          packages,
          manager: resolved,
          note: "Re-send with confirm:true to download these into the leased box. Install time is metered against the lease like any other command.",
        });
      }

      try {
        const result = await execInLease(
          String(args.leaseId),
          command,
          args.leaseToken ? String(args.leaseToken) : null,
        );
        if (result.exitCode !== 0) {
          const lease = getLease(String(args.leaseId));
          const readOnly = lease && !lease.spec.writable;
          return jsonResult({
            installed: [],
            manager: resolved,
            ...result,
            ...(readOnly
              ? {
                  hint: "This box was leased read-only, so package managers cannot write to it. Open a lease with writable:true to install packages, or choose an image that already has what you need.",
                }
              : {}),
          });
        }
        return jsonResult({ installed: packages, manager: resolved, ...result });
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.tool(
    "compute_end",
    "Close a lease, stop the sandbox and return the metered session summary.",
    {
      leaseId: z.string().describe("Lease id returned by compute_lease"),
      leaseToken: z.string().nullish().describe("Lease token proving you own this box"),
    },
    async (args) => {
      try {
        const closed = await closeLease(
          String(args.leaseId),
          args.leaseToken ? String(args.leaseToken) : null,
        );
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
