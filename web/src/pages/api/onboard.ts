import type { APIRoute } from "astro";
import { serverConfig } from "../../server/config.js";

export const prerender = false;

export const GET: APIRoute = async () => {
  try {
    const res = await fetch(`${serverConfig.serviceUrl}/onboard`, {
      signal: AbortSignal.timeout(5000),
    });
    return Response.json(await res.json(), { status: res.status });
  } catch (err) {
    return Response.json({ enabled: false, error: String(err) }, { status: 502 });
  }
};

export const POST: APIRoute = async () => {
  try {
    const res = await fetch(`${serverConfig.serviceUrl}/onboard`, { method: "POST" });
    return Response.json(await res.json(), { status: res.status });
  } catch (err) {
    return Response.json({ ok: false, error: String(err) }, { status: 502 });
  }
};
