import { config } from "../../config.js";

function redact(url: string): string {
  return url.replace(/\/api\/[^/]+\//, "/api/***/");
}

function resolveEndpoint(subgraph: string): string {
  if (/^https?:\/\//i.test(subgraph)) return subgraph;
  if (!config.graph.apiKey) {
    throw new Error(
      "subgraph id given without a full URL and GRAPH_API_KEY is not configured — pass a full subgraph query URL instead",
    );
  }
  return `${config.graph.gatewayBase}/${config.graph.apiKey}/subgraphs/id/${subgraph}`;
}

export async function queryGraph(
  subgraph: string,
  query: string,
  variables?: Record<string, unknown>,
) {
  const endpoint = resolveEndpoint(subgraph);
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query, variables: variables ?? {} }),
    signal: AbortSignal.timeout(10000),
  });
  const body = (await res.json()) as { data?: unknown; errors?: unknown[] };
  if (!res.ok || body.errors) {
    throw new Error(`graph query failed: ${JSON.stringify(body.errors ?? `http ${res.status}`)}`);
  }
  return { endpoint: redact(endpoint), data: body.data ?? null };
}
