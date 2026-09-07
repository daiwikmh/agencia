import OpenAI from "openai";
import { config } from "../../config.js";

const client = new OpenAI({
  baseURL: config.nim.baseUrl,
  apiKey: config.nim.apiKey,
});

export interface InferenceArgs {
  prompt: string;
  max_tokens: number;
  system?: string;
}

export interface InferenceResult {
  text: string;
  usage: { prompt: number; completion: number; total: number };
}

export async function runInference(args: InferenceArgs): Promise<InferenceResult> {
  const completion = await client.chat.completions.create({
    model: config.nim.model,
    max_tokens: args.max_tokens,
    messages: [
      ...(args.system ? [{ role: "system" as const, content: args.system }] : []),
      { role: "user" as const, content: args.prompt },
    ],
  });

  const message = completion.choices[0]?.message as
    | { content?: string | null; reasoning_content?: string | null }
    | undefined;
  const text = message?.content?.trim() || message?.reasoning_content?.trim() || "";

  return {
    text,
    usage: {
      prompt: completion.usage?.prompt_tokens ?? 0,
      completion: completion.usage?.completion_tokens ?? 0,
      total: completion.usage?.total_tokens ?? 0,
    },
  };
}

export function priceInHbar(maxTokens: number): number {
  return config.pricing.perCallHbar + config.pricing.per1kTokenHbar * (maxTokens / 1000);
}
