import type { APIRoute } from "astro";
import { runPaidInfer } from "../../server/pay-flow.js";

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  let body: { prompt?: unknown; maxTokens?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "invalid JSON body", steps: [] }, { status: 400 });
  }

  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  const maxTokens = Math.min(2048, Math.max(1, Number(body.maxTokens) || 256));
  if (!prompt) {
    return Response.json({ ok: false, error: "prompt is required", steps: [] }, { status: 400 });
  }

  try {
    const outcome = await runPaidInfer(prompt, maxTokens);
    return Response.json(outcome, { status: outcome.ok ? 200 : 502 });
  } catch (err) {
    return Response.json({ ok: false, error: String(err), steps: [] }, { status: 500 });
  }
};
