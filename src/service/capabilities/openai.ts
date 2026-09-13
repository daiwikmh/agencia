import OpenAI from "openai";
import { config } from "../../config.js";

const client = new OpenAI({
  baseURL: config.openai.baseUrl,
  apiKey: config.openai.apiKey,
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

export async function runOpenAIInference(args: InferenceArgs): Promise<InferenceResult> {
  const completion = await client.chat.completions.create({
    model: config.openai.model,
    max_tokens: args.max_tokens,
    messages: [
      ...(args.system ? [{ role: "system" as const, content: args.system }] : []),
      { role: "user" as const, content: args.prompt },
    ],
  });

  const text = completion.choices[0]?.message?.content?.trim() ?? "";

  return {
    text,
    usage: {
      prompt: completion.usage?.prompt_tokens ?? 0,
      completion: completion.usage?.completion_tokens ?? 0,
      total: completion.usage?.total_tokens ?? 0,
    },
  };
}
