import "../src/node-env.js";
import { config } from "../src/config.js";
import { streamPay } from "../src/agent/stream.js";

async function main() {
  const seconds = Number(process.argv[2] ?? 20);
  const tickSeconds = Number(process.argv[3] ?? 5);
  const ratePerSecondHbar = Number(process.argv[4] ?? 0.001);
  const payTo = process.env.AGENCIA_PAY_TO || config.agent.serviceUrl;

  if (!process.env.AGENCIA_PAY_TO) {
    console.error("Set AGENCIA_PAY_TO to the recipient account id");
    process.exit(1);
  }

  console.log(
    `[stream] paying ${ratePerSecondHbar} HBAR/s to ${payTo} for ${seconds}s, settling every ${tickSeconds}s via Scheduled Transactions`,
  );
  const ticks = await streamPay(
    { payTo: process.env.AGENCIA_PAY_TO, ratePerSecondHbar, seconds, tickSeconds },
    (t) =>
      console.log(
        `[stream] tick ${t.index}: ${t.amountHbar} HBAR · schedule ${t.scheduleId} · ${t.txId}`,
      ),
  );
  console.log(
    `[stream] done — ${ticks.length} scheduled transfers, ${ticks.reduce((s, t) => s + t.amountHbar, 0)} HBAR total`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
