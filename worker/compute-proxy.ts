import { config } from "../src/config.js";

export const COMPUTE_TOOLS = [
  "compute_lease",
  "compute_tick",
  "compute_exec",
  "compute_install",
  "compute_end",
  "compute_providers",
];

export function isComputeTool(name: string): boolean {
  return COMPUTE_TOOLS.includes(name);
}

function originUrl(): string | null {
  const raw = config.compute.originUrl;
  return raw ? raw.replace(/\/$/, "") : null;
}

export function computeOrigin(): string | null {
  return originUrl();
}

let reachability: { ok: boolean; at: number } | null = null;

/** Is a compute origin actually answering right now? Cached for 30s. */
export async function computeReachable(): Promise<boolean> {
  const origin = originUrl();
  if (!origin) return false;
  if (reachability && Date.now() - reachability.at < 30_000) return reachability.ok;

  let ok = false;
  try {
    const res = await fetch(`${origin}/health`, { signal: AbortSignal.timeout(4000) });
    ok = res.ok;
  } catch {
    ok = false;
  }
  reachability = { ok, at: Date.now() };
  return ok;
}

/**
 * Forward a tools/call verbatim to a compute-capable origin so the origin runs
 * its own x402 handshake, settlement and HCS receipt. Returns null when no
 * origin is configured or it cannot be reached.
 */
export async function proxyComputeCall(
  params: Record<string, unknown>,
  id: string | number | null,
): Promise<unknown | null> {
  const origin = originUrl();
  if (!origin) return null;

  try {
    const res = await fetch(`${origin}/mcp`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        ...(config.compute.originToken
          ? { authorization: `Bearer ${config.compute.originToken}` }
          : {}),
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: id ?? 1, method: "tools/call", params }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) return null;

    const text = await res.text();
    const payload = text.startsWith("event:")
      ? text
          .split("\n")
          .filter((line) => line.startsWith("data: "))
          .map((line) => line.slice(6))
          .join("")
      : text;
    const parsed = JSON.parse(payload) as { result?: unknown; error?: unknown };
    return parsed.result ?? null;
  } catch {
    return null;
  }
}

export function pendingComputeResult(name: string, args: Record<string, unknown>) {
  const requested = {
    tool: name,
    seconds: args.seconds ?? null,
    cpu: args.cpu ?? null,
    memMb: args.memMb ?? null,
    provider: args.provider ?? "auto",
  };

  return {
    isError: true,
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(
          {
            status: "pending",
            message:
              "Your compute request has been accepted and is waiting on hardware. No payment was taken — you are only charged once a box is running.",
            requested,
            why: "This edge endpoint has no compute origin attached yet. Compute runs on supplier machines, not on the edge runtime.",
            howToAttach:
              "Start the Node service with a supplier allowlisted, expose it (e.g. cloudflared tunnel --url http://localhost:3022), then set COMPUTE_ORIGIN_URL on this Worker. Leases then provision here for real.",
            meanwhile: `Every other tool on this endpoint is live and payable right now.`,
          },
          null,
          2,
        ),
      },
    ],
  };
}
