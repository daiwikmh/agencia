import { Hono } from "hono";
import { config } from "../../../config.js";
import { createFundedAccount, makeClient } from "../../../hedera.js";

export const onboard = new Hono();

const issued: number[] = [];

function withinLimit(): boolean {
  const cutoff = Date.now() - 3_600_000;
  while (issued.length && issued[0] < cutoff) issued.shift();
  return issued.length < config.onboard.maxPerHour;
}

onboard.get("/onboard", (c) =>
  c.json({
    enabled: config.onboard.enabled && config.network === "hedera:testnet",
    network: config.network,
    fundsHbar: config.onboard.fundHbar,
    maxPerHour: config.onboard.maxPerHour,
    issuedLastHour: issued.length,
    how: "POST /onboard to be issued a funded testnet account. The private key is returned once and never stored.",
  }),
);

onboard.post("/onboard", async (c) => {
  if (!config.onboard.enabled) {
    return c.json({ error: "onboarding is disabled on this service" }, 403);
  }
  if (config.network !== "hedera:testnet") {
    return c.json({ error: "onboarding only issues testnet accounts" }, 403);
  }
  if (!config.service.operatorId || !config.service.operatorKey) {
    return c.json({ error: "service operator is not configured" }, 503);
  }
  if (!withinLimit()) {
    return c.json({ error: `rate limit: ${config.onboard.maxPerHour} accounts per hour` }, 429);
  }

  const client = makeClient(config.service.operatorId, config.service.operatorKey);
  try {
    const account = await createFundedAccount(client, config.onboard.fundHbar);
    issued.push(Date.now());
    return c.json(
      {
        ok: true,
        network: config.network,
        accountId: account.accountId,
        privateKey: account.privateKey,
        publicKey: account.publicKey,
        evmAddress: account.evmAddress,
        fundedHbar: account.fundedHbar,
        keyType: "ECDSA",
        mcp: `${new URL(c.req.url).origin}/mcp`,
        warning:
          "Testnet credentials, returned once. Store the private key in your own .env — this service does not keep a copy.",
      },
      201,
    );
  } catch (err) {
    return c.json({ error: String(err instanceof Error ? err.message : err) }, 502);
  } finally {
    client.close();
  }
});
