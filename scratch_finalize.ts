import { AccountId, Hbar, TransferTransaction } from "@hashgraph/sdk";
import { config } from "./src/config.js";
import { makeClient } from "./src/hedera.js";

async function main() {
  const client = makeClient(config.agent.accountId, config.agent.privateKey);
  const tx = await new TransferTransaction()
    .addHbarTransfer(AccountId.fromString(config.agent.accountId), new Hbar(-0.01))
    .addHbarTransfer(AccountId.fromString(config.service.operatorId), new Hbar(0.01))
    .execute(client);
  const receipt = await tx.getReceipt(client);
  console.log("agent finalize tx:", tx.transactionId.toString(), receipt.status.toString());
  client.close();
}
main().catch((e) => { console.error("FAILED", String(e)); process.exit(1); });
