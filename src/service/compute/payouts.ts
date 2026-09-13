import { AccountId, Hbar, TransferTransaction } from "@hashgraph/sdk";
import { config, hbarToTinybar } from "../../config.js";
import { makeClient } from "../../hedera.js";
import { recordSettlement } from "../audit/hcs.js";
import { recordSupplierPayout, supplierById } from "./suppliers.js";

export interface Payout {
  supplierId: string;
  payoutAccountId: string;
  hbar: number;
  transaction: string;
  hcs: { topicId: string; sequenceNumber: string } | null;
}

export async function payoutSupplier(
  supplierId: string,
  grossHbar: number,
  leaseId: string,
): Promise<Payout | null> {
  const supplier = supplierById(supplierId);
  if (!supplier) return null;

  const share = Math.max(0, (grossHbar * config.compute.supplierSharePct) / 100);
  const tinybar = hbarToTinybar(share);
  if (tinybar <= 0n) return null;
  if (!config.service.operatorId || !config.service.operatorKey) return null;

  const client = makeClient(config.service.operatorId, config.service.operatorKey);
  try {
    const response = await new TransferTransaction()
      .addHbarTransfer(AccountId.fromString(config.service.operatorId), Hbar.fromTinybars(-tinybar))
      .addHbarTransfer(AccountId.fromString(supplier.payoutAccountId), Hbar.fromTinybars(tinybar))
      .setTransactionMemo(`agencia:payout:${leaseId}`)
      .execute(client);
    await response.getReceipt(client);

    const transaction = response.transactionId.toString();
    recordSupplierPayout(supplierId, share);
    const hcs = await recordSettlement({
      kind: "supplier-payout",
      supplier: supplierId,
      payoutAccountId: supplier.payoutAccountId,
      leaseId,
      grossHbar,
      sharePct: config.compute.supplierSharePct,
      amountHbar: share,
      transaction,
      settledAt: new Date().toISOString(),
    });

    return {
      supplierId,
      payoutAccountId: supplier.payoutAccountId,
      hbar: share,
      transaction,
      hcs,
    };
  } finally {
    client.close();
  }
}
