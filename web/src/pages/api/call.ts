import type { APIRoute } from "astro";
import { runPaidCall } from "../../server/pay-flow.js";

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  let body: { tool?: unknown; args?: unknown; maxHbar?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "invalid JSON body", steps: [] }, { status: 400 });
  }

  const tool = typeof body.tool === "string" ? body.tool : "";
  const args =
    body.args && typeof body.args === "object" ? (body.args as Record<string, unknown>) : {};
  const maxHbar = Number(body.maxHbar) > 0 ? Number(body.maxHbar) : undefined;

  if (!tool) {
    return Response.json({ ok: false, error: "tool is required", steps: [] }, { status: 400 });
  }

  try {
    const outcome = await runPaidCall(tool, args, maxHbar);
    return Response.json(outcome, { status: outcome.ok ? 200 : 502 });
  } catch (err) {
    return Response.json({ ok: false, error: String(err), steps: [] }, { status: 500 });
  }
};
