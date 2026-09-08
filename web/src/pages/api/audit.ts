import type { APIRoute } from "astro";
import { fetchTopicMessages } from "../../server/hedera.js";
import { fetchManifest } from "../../server/pay-flow.js";

export const prerender = false;

export const GET: APIRoute = async ({ url }) => {
  try {
    let topicId = url.searchParams.get("topicId") ?? "";
    if (!topicId) {
      const manifest = await fetchManifest();
      topicId = manifest.audit?.topicId ?? "";
    }
    if (!topicId) {
      return Response.json({ ok: true, topicId: null, messages: [] });
    }
    const messages = await fetchTopicMessages(topicId, 30);
    return Response.json({ ok: true, topicId, messages });
  } catch (err) {
    return Response.json({ ok: false, error: String(err), messages: [] });
  }
};
