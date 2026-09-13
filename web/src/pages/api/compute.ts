import type { APIRoute } from "astro";
import { serverConfig } from "../../server/config.js";
import { runPaidCall } from "../../server/pay-flow.js";
import { runFreeTool } from "../../server/free-call.js";

export const prerender = false;

export const GET: APIRoute = async ({ url }) => {
  try {
    const res = await fetch(
      `${serverConfig.serviceUrl}/compute/inventory?cpu=${url.searchParams.get("cpu") ?? 1}&memMb=${url.searchParams.get("memMb") ?? 512}`,
      { signal: AbortSignal.timeout(15000) },
    );
    return Response.json(await res.json(), { status: res.status });
  } catch (err) {
    return Response.json({ error: `service unreachable: ${String(err)}` }, { status: 502 });
  }
};

export const POST: APIRoute = async ({ request }) => {
  let body: {
    action?: string;
    leaseId?: string;
    leaseToken?: string;
    command?: string;
    packages?: string;
    confirm?: boolean;
    seconds?: number;
    cpu?: number;
    memMb?: number;
    provider?: string;
  };
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "invalid JSON body" }, { status: 400 });
  }

  try {
    switch (body.action) {
      case "lease": {
        const outcome = await runPaidCall("compute_lease", {
          seconds: Number(body.seconds ?? 60),
          cpu: Number(body.cpu ?? 1),
          memMb: Number(body.memMb ?? 512),
          provider: body.provider ?? "auto",
        });
        return Response.json(outcome, { status: outcome.ok ? 200 : 502 });
      }
      case "tick": {
        const outcome = await runPaidCall("compute_tick", { leaseId: String(body.leaseId) });
        return Response.json(outcome, { status: outcome.ok ? 200 : 502 });
      }
      case "exec": {
        const result = await runFreeTool("compute_exec", {
          leaseId: String(body.leaseId),
          leaseToken: body.leaseToken,
          command: String(body.command ?? ""),
        });
        return Response.json({ ok: true, result });
      }
      case "install": {
        const result = await runFreeTool("compute_install", {
          leaseId: String(body.leaseId),
          leaseToken: body.leaseToken,
          packages: String(body.packages ?? ""),
          confirm: body.confirm === true,
        });
        return Response.json({ ok: true, result });
      }
      case "end": {
        const result = await runFreeTool("compute_end", {
          leaseId: String(body.leaseId),
          leaseToken: body.leaseToken,
        });
        return Response.json({ ok: true, result });
      }
      default:
        return Response.json({ ok: false, error: `unknown action "${body.action}"` }, { status: 400 });
    }
  } catch (err) {
    return Response.json(
      { ok: false, error: String(err instanceof Error ? err.message : err) },
      { status: 502 },
    );
  }
};
