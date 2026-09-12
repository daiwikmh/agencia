import type { APIRoute } from "astro";
import { serverConfig } from "../../server/config.js";

export const prerender = false;

export const GET: APIRoute = async () => {
  const accountId = serverConfig.agent.accountId;
  const budgetHbar = serverConfig.agent.budgetHbar;

  if (!accountId) {
    return Response.json({ ok: false, error: "AGENT_ACCOUNT_ID not configured", budgetHbar });
  }

  try {
    const res = await fetch(`${serverConfig.mirrorNodeUrl}/api/v1/accounts/${accountId}`, {
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) throw new Error(`mirror node ${res.status}`);
    const data = (await res.json()) as {
      account?: string;
      balance?: { balance?: number; tokens?: { token_id: string; balance: number }[] };
      created_timestamp?: string;
    };
    return Response.json({
      ok: true,
      accountId: data.account ?? accountId,
      balanceHbar: (data.balance?.balance ?? 0) / 1e8,
      tokens: data.balance?.tokens ?? [],
      createdTimestamp: data.created_timestamp ?? null,
      budgetHbar,
      network: serverConfig.network,
    });
  } catch (err) {
    return Response.json({ ok: false, error: String(err), accountId, budgetHbar });
  }
};
