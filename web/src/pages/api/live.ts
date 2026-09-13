import type { APIRoute } from "astro";
import { runLive, type LiveEvent, type Scenario } from "../../server/live-run.js";

export const prerender = false;

function scenarioFrom(url: URL): Scenario {
  if (url.searchParams.get("scenario") === "goal") {
    return {
      scenario: "goal",
      goal: url.searchParams.get("goal") ?? "What is HBAR worth right now?",
      maxTurns: Math.min(Number(url.searchParams.get("maxTurns") ?? 5), 8),
      maxHbar: Number(url.searchParams.get("maxHbar")) || undefined,
    };
  }

  if (url.searchParams.get("scenario") === "lease") {
    return {
      scenario: "lease",
      seconds: Number(url.searchParams.get("seconds") ?? 30),
      cpu: Number(url.searchParams.get("cpu") ?? 1),
      memMb: Number(url.searchParams.get("memMb") ?? 512),
      ticks: Math.min(Number(url.searchParams.get("ticks") ?? 2), 6),
      command:
        url.searchParams.get("command") ??
        "node -e \"console.log('agent runtime online:', process.version)\"",
    };
  }

  const args: Record<string, unknown> = {};
  for (const [key, value] of url.searchParams) {
    if (["scenario", "tool", "maxHbar", "goal", "maxTurns"].includes(key)) continue;
    args[key] = /^-?\d+(\.\d+)?$/.test(value) ? Number(value) : value;
  }
  return {
    scenario: "tool",
    tool: url.searchParams.get("tool") ?? "infer",
    args,
    maxHbar: Number(url.searchParams.get("maxHbar")) || undefined,
  };
}

export const GET: APIRoute = async ({ request }) => {
  const scenario = scenarioFrom(new URL(request.url));
  const encoder = new TextEncoder();
  let seq = 0;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: Omit<LiveEvent, "seq" | "at">) => {
        const payload: LiveEvent = { ...event, seq: ++seq, at: new Date().toISOString() };
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
      };
      try {
        await runLive(scenario, send);
      } catch (err) {
        send({ phase: "error", label: "Run failed", detail: String(err) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
    },
  });
};
