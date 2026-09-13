import type { APIRoute } from "astro";
import {
  AccountId,
  Client,
  Hbar,
  PrivateKey,
  ScheduleCreateTransaction,
  TransferTransaction,
} from "@hashgraph/sdk";
import { serverConfig } from "../../server/config.js";

export const prerender = false;

const TINYBAR = 100_000_000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function parseKey(raw: string): PrivateKey {
  for (const attempt of [
    () => PrivateKey.fromStringECDSA(raw),
    () => PrivateKey.fromStringED25519(raw),
    () => PrivateKey.fromStringDer(raw),
  ]) {
    try {
      return attempt();
    } catch {
      continue;
    }
  }
  throw new Error("unrecognized AGENT_PRIVATE_KEY format");
}

export const GET: APIRoute = async ({ url }) => {
  const payTo = url.searchParams.get("payTo") ?? "";
  const ratePerSecondHbar = Number(url.searchParams.get("rate") ?? 0.001);
  const tickSeconds = Math.max(2, Number(url.searchParams.get("tickSeconds") ?? 5));
  const ticks = Math.min(Number(url.searchParams.get("ticks") ?? 4), 12);

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let seq = 0;
      const send = (event: Record<string, unknown>) =>
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ seq: ++seq, at: new Date().toISOString(), ...event })}\n\n`),
        );

      if (!/^\d+\.\d+\.\d+$/.test(payTo)) {
        send({ phase: "error", label: "payTo must be a Hedera account id like 0.0.1234" });
        controller.close();
        return;
      }
      if (!serverConfig.agent.accountId || !serverConfig.agent.privateKey) {
        send({ phase: "error", label: "no agent wallet configured on the dashboard" });
        controller.close();
        return;
      }

      const client =
        serverConfig.network.includes("mainnet") ? Client.forMainnet() : Client.forTestnet();
      client.setOperator(
        AccountId.fromString(serverConfig.agent.accountId),
        parseKey(serverConfig.agent.privateKey),
      );

      const perTickHbar = ratePerSecondHbar * tickSeconds;
      const perTickTinybar = Math.round(perTickHbar * TINYBAR);

      send({
        phase: "start",
        label: `Streaming ${ratePerSecondHbar} ℏ/s to ${payTo}`,
        detail: `${ticks} scheduled transfers, one every ${tickSeconds}s · ${perTickHbar.toFixed(6)} ℏ each`,
      });

      try {
        for (let i = 1; i <= ticks; i++) {
          const transfer = new TransferTransaction()
            .addHbarTransfer(
              AccountId.fromString(serverConfig.agent.accountId),
              Hbar.fromTinybars(-perTickTinybar),
            )
            .addHbarTransfer(AccountId.fromString(payTo), Hbar.fromTinybars(perTickTinybar))
            .setTransactionMemo(`agencia:stream:${i}/${ticks}`);

          const response = await new ScheduleCreateTransaction()
            .setScheduledTransaction(transfer)
            .setScheduleMemo(`agencia metered stream tick ${i}`)
            .execute(client);
          const receipt = await response.getReceipt(client);

          send({
            phase: "tick",
            label: `Tick ${i}/${ticks} scheduled`,
            detail: `schedule ${receipt.scheduleId?.toString() ?? "unknown"}`,
            hbar: perTickHbar,
            transaction: response.transactionId.toString(),
            hashscan: `${serverConfig.hashscanBase}/transaction/${response.transactionId
              .toString()
              .replace("@", "-")
              .replace(/\.(\d+)$/, "-$1")}`,
            scheduleId: receipt.scheduleId?.toString() ?? null,
          });

          if (i < ticks) await sleep(tickSeconds * 1000);
        }
        send({
          phase: "done",
          label: "Stream complete",
          hbar: perTickHbar * ticks,
          detail: `${ticks} scheduled transfers`,
        });
      } catch (err) {
        send({ phase: "error", label: "Stream failed", detail: String(err instanceof Error ? err.message : err) });
      } finally {
        client.close();
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
    },
  });
};
