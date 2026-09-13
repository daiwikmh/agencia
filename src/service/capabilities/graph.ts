import { config } from "../../config.js";

function redact(url: string): string {
  // legacy key-in-path form only; header auth leaves nothing to redact
  return url.replace(/\/api\/[0-9a-f]{16,}\//i, "/api/***/");
}

interface Resolved {
  endpoint: string;
  headers: Record<string, string>;
}

function resolveEndpoint(subgraph: string): Resolved {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (/^https?:\/\//i.test(subgraph)) return { endpoint: subgraph, headers };

  if (!config.graph.apiKey) {
    throw new Error(
      "subgraph id given without a full URL and GRAPH_API_KEY is not configured — pass a full subgraph query URL instead",
    );
  }
  return {
    endpoint: `${config.graph.gatewayBase}/subgraphs/id/${subgraph}`,
    headers: { ...headers, authorization: `Bearer ${config.graph.apiKey}` },
  };
}

export async function queryGraph(
  subgraph: string,
  query: string,
  variables?: Record<string, unknown>,
) {
  const { endpoint, headers } = resolveEndpoint(subgraph);
  const res = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify({ query, variables: variables ?? {} }),
    signal: AbortSignal.timeout(10000),
  });
  const body = (await res.json()) as { data?: unknown; errors?: unknown[] };
  if (!res.ok || body.errors) {
    throw new Error(`graph query failed: ${JSON.stringify(body.errors ?? `http ${res.status}`)}`);
  }
  return { endpoint: redact(endpoint), data: body.data ?? null };
}

interface SchemaField {
  name: string;
  type: string;
}

interface SchemaType {
  name: string;
  fields: SchemaField[];
}

const INTROSPECTION = `{
  __schema {
    queryType { name }
    types {
      name
      kind
      fields { name type { name kind ofType { name kind ofType { name } } } }
    }
  }
}`;

function unwrapType(t: unknown): string {
  const node = t as { name?: string; kind?: string; ofType?: unknown } | null;
  if (!node) return "unknown";
  if (node.name) return node.name;
  return unwrapType(node.ofType);
}

/** Entity types and their fields — enough for a model to write a correct query. */
export async function introspectSchema(subgraph: string): Promise<{
  endpoint: string;
  entities: SchemaType[];
}> {
  const { endpoint, headers } = resolveEndpoint(subgraph);
  const res = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify({ query: INTROSPECTION }),
    signal: AbortSignal.timeout(15000),
  });
  const body = (await res.json()) as {
    data?: { __schema?: { types?: { name: string; kind: string; fields?: unknown[] }[] } };
    errors?: unknown[];
  };
  if (!res.ok || body.errors || !body.data?.__schema) {
    throw new Error(`schema introspection failed: ${JSON.stringify(body.errors ?? `http ${res.status}`)}`);
  }

  const entities = (body.data.__schema.types ?? [])
    .filter(
      (t) =>
        t.kind === "OBJECT" &&
        !t.name.startsWith("__") &&
        !["Query", "Subscription", "_Meta_", "_Block_"].includes(t.name) &&
        Array.isArray(t.fields),
    )
    .map((t) => ({
      name: t.name,
      fields: (t.fields as { name: string; type: unknown }[])
        .map((f) => ({ name: f.name, type: unwrapType(f.type) }))
        .slice(0, 24),
    }))
    .slice(0, 40);

  return { endpoint: redact(endpoint), entities };
}

function schemaSummary(entities: SchemaType[]): string {
  return entities
    .map((e) => `${e.name} { ${e.fields.map((f) => `${f.name}:${f.type}`).join(" ")} }`)
    .join("\n");
}

function balancedFrom(text: string, start: number): string | null {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === "\\") {
      escaped = true;
      continue;
    }
    if (ch === '"') inString = !inString;
    if (inString) continue;
    if (ch === "{") depth++;
    if (ch === "}") {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

/**
 * Reasoning models narrate before answering, and the narration is full of example
 * JSON. Take the LAST object that actually parses and carries a query.
 */
function extractQuery(raw: string): string | null {
  const text = raw.replace(/```(?:graphql|json)?/gi, "");

  const candidates: string[] = [];
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== "{") continue;
    const block = balancedFrom(text, i);
    if (!block) continue;
    try {
      const parsed = JSON.parse(block) as { query?: unknown };
      if (typeof parsed.query === "string" && parsed.query.includes("{")) {
        candidates.push(parsed.query);
      }
    } catch {
      /* not JSON — maybe raw GraphQL, handled below */
    }
  }
  if (candidates.length) return candidates[candidates.length - 1];

  // no JSON wrapper: accept a bare GraphQL block if one balances
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== "{") continue;
    const block = balancedFrom(text, i);
    if (block && /\w+\s*[({]/.test(block) && block.length > 12) return block;
  }
  return null;
}

/**
 * Natural language in, reasoned answer out: introspect the subgraph, have a model
 * write the GraphQL, run it against live Graph data, then answer from the result.
 */
export async function askGraph(
  subgraph: string,
  question: string,
  runModel: (prompt: string, maxTokens: number) => Promise<string>,
) {
  const schema = await introspectSchema(subgraph);

  const writePrompt = `You write GraphQL queries for a subgraph on The Graph.

SCHEMA (entity: fields):
${schemaSummary(schema.entities)}

QUESTION: ${question}

Rules: prefer the plural collection field (e.g. "pools" for Pool). Pass first: 5 when the field accepts it. Use only fields that appear in the schema above.

Think briefly, then END your reply with exactly one line containing the JSON and nothing after it:
{"query":"<graphql query text>"}`;

  const drafted = await runModel(writePrompt, 900);
  let query = extractQuery(drafted);
  if (!query) throw new Error(`could not derive a GraphQL query from: ${drafted.slice(0, 200)}`);

  let result: Awaited<ReturnType<typeof queryGraph>>;
  let repaired = false;
  try {
    result = await queryGraph(subgraph, query);
  } catch (err) {
    // The subgraph just told us precisely what is wrong — let the model fix it once.
    const reason = err instanceof Error ? err.message : String(err);
    const fixPrompt = `${writePrompt}

YOUR PREVIOUS QUERY WAS REJECTED:
${query}

THE SERVER SAID:
${reason.slice(0, 600)}

Fix it. Drop any argument or field the server called unknown — the server is right and the earlier rules are only defaults. End with the JSON line.`;
    const second = await runModel(fixPrompt, 900);
    const retry = extractQuery(second);
    if (!retry) throw err;
    query = retry;
    repaired = true;
    result = await queryGraph(subgraph, query);
  }

  const answerPrompt = `QUESTION: ${question}

GRAPHQL RUN AGAINST LIVE SUBGRAPH DATA:
${query}

RESULT:
${JSON.stringify(result.data).slice(0, 4000)}

Answer the question from this data in two or three sentences. Cite the concrete numbers you used. If the data does not answer it, say so plainly.`;

  const answer = await runModel(answerPrompt, 700);

  return {
    question,
    endpoint: schema.endpoint,
    generatedQuery: query,
    repairedAfterError: repaired,
    entitiesSeen: schema.entities.length,
    data: result.data,
    answer: answer.trim(),
  };
}
