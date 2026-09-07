import {
  AccountId,
  Hbar,
  ScheduleCreateTransaction,
  TransferTransaction,
} from "@hashgraph/sdk";
import { config, hbarToTinybar } from "../config.js";
import { makeClient } from "../hedera.js";

export interface StreamOptions {
  payTo: string;
  ratePerSecondHbar: number;
  seconds: number;
  tickSeconds: number;
}

export interface StreamTick {
  index: number;
  amountHbar: number;
  scheduleId: string;
  txId: string;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function streamPay(
  opts: StreamOptions,
  onTick?: (tick: StreamTick) => void,
): Promise<StreamTick[]> {
  if (!config.agent.accountId || !config.agent.privateKey) {
    throw new Error("AGENT_ACCOUNT_ID and AGENT_PRIVATE_KEY are required");
  }
  const client = makeClient(config.agent.accountId, config.agent.privateKey);
  const from = AccountId.fromString(config.agent.accountId);
  const to = AccountId.fromString(opts.payTo);
  const ticks = Math.max(1, Math.floor(opts.seconds / opts.tickSeconds));
  const perTickHbar = opts.ratePerSecondHbar * opts.tickSeconds;
  const perTickTinybar = hbarToTinybar(perTickHbar);
  const out: StreamTick[] = [];

  try {
    for (let i = 0; i < ticks; i++) {
      const transfer = new TransferTransaction()
        .addHbarTransfer(from, Hbar.fromTinybars(-perTickTinybar))
        .addHbarTransfer(to, Hbar.fromTinybars(perTickTinybar))
        .setTransactionMemo(`agencia:stream:${i + 1}/${ticks}`);

      const response = await new ScheduleCreateTransaction()
        .setScheduledTransaction(transfer)
        .setScheduleMemo(`agencia metered stream tick ${i + 1}`)
        .execute(client);
      const receipt = await response.getReceipt(client);

      const tick: StreamTick = {
        index: i + 1,
        amountHbar: perTickHbar,
        scheduleId: receipt.scheduleId?.toString() ?? "unknown",
        txId: response.transactionId.toString(),
      };
      out.push(tick);
      onTick?.(tick);
      if (i < ticks - 1) await sleep(opts.tickSeconds * 1000);
    }
    return out;
  } finally {
    client.close();
  }
}
