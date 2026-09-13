import { closeLease, execInLease, openLease } from "../compute/leases.js";
import { config } from "../../config.js";
import { introspectSchema, queryGraph } from "./graph.js";

export interface AnalyzeInput {
  subgraph: string;
  goal: string;
  seconds: number;
  cpu: number;
  memMb: number;
  owner?: string | null;
  agent?: string | null;
  paidHbar: number;
  ratePerSecondHbar: number;
}

export type RunModel = (prompt: string, maxTokens: number) => Promise<string>;

const MAX_DATA_BYTES = 200_000;

function lastJsonField(raw: string, field: string): string | null {
  const text = raw.replace(/```(?:javascript|js|json|graphql)?/gi, "");
  const found: string[] = [];
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== "{") continue;
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let j = i; j < text.length; j++) {
      const ch = text[j];
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
        if (depth === 0) {
          try {
            const parsed = JSON.parse(text.slice(i, j + 1)) as Record<string, unknown>;
            const value = parsed[field];
            if (typeof value === "string" && value.length > 4) found.push(value);
          } catch {
            /* keep scanning */
          }
          break;
        }
      }
    }
  }
  return found.length ? found[found.length - 1] : null;
}

const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64");

/**
 * Models routinely double-escape when asked for code inside JSON, so the parsed
 * string arrives with two-character \n sequences instead of newlines. If nothing
 * in it is a real newline, take the escapes literally.
 */
function unflatten(code: string): string {
  if (code.includes("\n")) return code;
  return code
    .replace(/\\r\\n/g, "\n")
    .replace(/\\n/g, "\n")
    .replace(/\\t/g, "\t");
}

/**
 * Code inside a JSON string means the model has to escape every newline and
 * quote, and a small model gets that wrong constantly — truncated scripts,
 * literal \n, unbalanced braces. A fenced block is the shape models emit well,
 * so take the last one.
 */
function lastFencedBlock(raw: string): string | null {
  const blocks = [...raw.matchAll(/```(?:javascript|js|node)?\s*\n([\s\S]*?)```/g)].map((m) => m[1]);
  const usable = blocks.filter((b) => b.includes("require(") || b.includes("console.log"));
  const chosen = (usable.length ? usable : blocks).pop();
  return chosen ? chosen.trim() : null;
}

/**
 * Reasoning models will happily spend the whole budget thinking and never emit
 * the answer. Ask once; if nothing parses, ask again with no room to ruminate.
 */
async function askForJson(
  runModel: RunModel,
  prompt: string,
  field: string,
  maxTokens: number,
): Promise<string | null> {
  const first = await runModel(prompt, maxTokens);
  const found = lastJsonField(first, field);
  if (found) return found;

  const terse = `${prompt}

CRITICAL: reply with ONLY the single JSON line. No reasoning, no explanation, no preamble.`;
  return lastJsonField(await runModel(terse, maxTokens), field);
}

/**
 * Live subgraph data, analysed on hardware the caller rents by the second.
 *
 * A single GraphQL response answers "what is X". This answers "what does X mean"
 * — the rows are pulled from The Graph, pushed into a sandboxed box, and a
 * model-written program computes over them there. The box dies when it's done.
 */
export async function analyzeSubgraph(input: AnalyzeInput, runModel: RunModel) {
  const schema = await introspectSchema(input.subgraph);
  const schemaSummary = schema.entities
    .slice(0, 18)
    .map((e) => `${e.name} { ${e.fields.slice(0, 12).map((f) => `${f.name}:${f.type}`).join(" ")} }`)
    .join("\n");

  // 1. a query broad enough to compute over, not just read
  const queryPrompt = `You write GraphQL for a subgraph on The Graph.

SCHEMA:
${schemaSummary}

ANALYSIS GOAL: ${input.goal}

Write ONE query returning enough rows to compute over (use first: 100 where the field allows it, and orderBy/orderDirection when useful). Only use fields in the schema.
Think briefly, then end with exactly one line of JSON and nothing after it:
{"query":"<graphql>"}`;

  const queryRaw = await askForJson(runModel, queryPrompt, "query", 1500);
  if (!queryRaw) throw new Error("the model never produced a GraphQL query for this goal");
  const query = unflatten(queryRaw);

  const result = await queryGraph(input.subgraph, query);
  const dataJson = JSON.stringify(result.data);
  if (dataJson.length > MAX_DATA_BYTES) {
    throw new Error(
      `subgraph returned ${dataJson.length} bytes, above the ${MAX_DATA_BYTES} limit for one analysis — narrow the query`,
    );
  }
  const rowCount = Object.values((result.data ?? {}) as Record<string, unknown>).reduce<number>(
    (n, v) => n + (Array.isArray(v) ? v.length : 0),
    0,
  );

  // 2. rent hardware for the computation
  const lease = await openLease({
    seconds: input.seconds,
    cpu: input.cpu,
    memMb: input.memMb,
    provider: "auto",
    paidHbar: input.paidHbar,
    ratePerSecondHbar: input.ratePerSecondHbar,
    owner: input.owner ?? null,
    agent: input.agent ?? null,
  });

  try {
    await execInLease(
      lease.id,
      `echo '${b64(dataJson)}' | base64 -d > /tmp/data.json && wc -c /tmp/data.json`,
      lease.token,
    );

    // 3. a program written for this question, run on the rented box
    const codePrompt = `Write a Node.js script that analyses subgraph data.

The file /tmp/data.json contains this shape (truncated):
${dataJson.slice(0, 1200)}

ANALYSIS GOAL: ${input.goal}

Requirements: read /tmp/data.json with fs.readFileSync, compute real aggregates (sums, averages, ratios, rankings, concentration — whatever the goal needs), and console.log a short readable report. Plain CommonJS, no imports beyond "fs", no network.

End your reply with the COMPLETE script in one fenced block:
\`\`\`js
const fs = require('fs');
// ...
\`\`\``;

    let code = lastFencedBlock(await runModel(codePrompt, 2000));
    if (!code) {
      code = lastFencedBlock(
        await runModel(`${codePrompt}\n\nCRITICAL: output ONLY the fenced script block.`, 2000),
      );
    }
    if (!code) throw new Error("the model never produced an analysis script for this goal");

    let run = await execInLease(
      lease.id,
      `echo '${b64(code)}' | base64 -d > /tmp/analyze.js && node /tmp/analyze.js`,
      lease.token,
    );

    let repaired = false;
    if (run.exitCode !== 0) {
      const fix = await runModel(
        `${codePrompt}

YOUR PREVIOUS SCRIPT FAILED:
${code.slice(0, 800)}

STDERR:
${run.stderr.slice(0, 600)}

Fix it and end with the complete corrected script in one fenced block.`,
        2000,
      );
      const retry = lastFencedBlock(fix);
      if (retry) {
        code = retry;
        repaired = true;
        run = await execInLease(
          lease.id,
          `echo '${b64(code)}' | base64 -d > /tmp/analyze.js && node /tmp/analyze.js`,
          lease.token,
        );
      }
    }

    if (run.exitCode !== 0) {
      throw new Error(
        `the analysis program failed on the rented box (exit ${run.exitCode}) — not charging for it: ${run.stderr.slice(0, 300)}`,
      );
    }

    // 4. explain what the computation found
    const output = (run.stdout || run.stderr).slice(0, 3000);
    const answer = await runModel(
      `ANALYSIS GOAL: ${input.goal}

A program ran on ${rowCount} rows of live subgraph data and printed:
${output}

Explain what this shows in three or four sentences, citing the concrete numbers. If the output is an error or empty, say so plainly instead of inventing findings.`,
      600,
    );

    return {
      goal: input.goal,
      endpoint: schema.endpoint,
      generatedQuery: query,
      rowsAnalysed: rowCount,
      analysisScript: code,
      scriptRepaired: repaired,
      exitCode: run.exitCode,
      output,
      answer: answer.trim(),
      compute: {
        leaseId: lease.id,
        provider: lease.providerLabel,
        cpu: lease.spec.cpu,
        memMb: lease.spec.memMb,
        secondsRented: input.seconds,
        execMs: run.durationMs,
      },
    };
  } finally {
    await closeLease(lease.id, lease.token).catch(() => undefined);
  }
}

export const analyzeDefaults = {
  seconds: 60,
  cpu: 1,
  memMb: 512,
  image: config.compute.image,
};
