import { Client as McpClient } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { x402Client } from "@x402/core/client";
import type { PaymentRequired } from "@x402/core/types";
import { createClientHederaSigner, PrivateKey } from "@x402/hedera";
import { ExactHederaScheme } from "@x402/hedera/exact/client";
import { verifyPayment, settlePayment } from "./src/facilitator.js";
import { config } from "./src/config.js";
import { decodePayment } from "./src/x402.js";

async function main() {
  const mcp = new McpClient({ name: "debug", version: "0.1" });
  await mcp.connect(new StreamableHTTPClientTransport(new URL("http://localhost:3022/mcp")));

  const first: any = await mcp.callTool({ name: "hbar_price", arguments: { vs: "usd" } });
  const challenge = first._meta?.["x402/error"] as PaymentRequired;
  console.log("challenge:", JSON.stringify(challenge, null, 1));

  const signer = createClientHederaSigner(config.agent.accountId, PrivateKey.fromStringECDSA(config.agent.privateKey));
  const client = new x402Client()
    .register("hedera:*", new ExactHederaScheme(signer))
    .setSpendControls({ allowedAssets: [{ network: config.network, asset: "0.0.0", maxAmountPerPayment: "100000000" }] });

  const payload = await client.createPaymentPayload(challenge);
  console.log("payload:", JSON.stringify(payload, null, 1));

  const requirements = challenge.accepts[0];
  const v = await verifyPayment(payload as any, requirements);
  console.log("VERIFY:", JSON.stringify(v, null, 1));

  if (v.isValid) {
    const s = await settlePayment(payload as any, requirements);
    console.log("SETTLE:", JSON.stringify(s, null, 1));
  }

  await mcp.close();
}
main().catch((e) => console.error("FATAL", e));
