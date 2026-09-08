import type { APIRoute } from "astro";
import { serverConfig } from "../../server/config.js";
import { fetchHealth } from "../../server/pay-flow.js";

export const prerender = false;

export const GET: APIRoute = async () => {
  try {
    const health = await fetchHealth();
    return Response.json({ reachable: true, serviceUrl: serverConfig.serviceUrl, health });
  } catch (err) {
    return Response.json({
      reachable: false,
      serviceUrl: serverConfig.serviceUrl,
      error: String(err),
    });
  }
};
