import type { APIRoute } from "astro";
import { fetchManifest } from "../../server/pay-flow.js";

export const prerender = false;

export const GET: APIRoute = async () => {
  try {
    const manifest = await fetchManifest();
    return Response.json({ ok: true, manifest });
  } catch (err) {
    return Response.json({ ok: false, error: String(err) });
  }
};
