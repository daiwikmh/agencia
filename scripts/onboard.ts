import "../src/node-env.js";
import { readFileSync, writeFileSync } from "node:fs";
import { AgenciaClient, requestWallet } from "../src/client/index.js";
import { config } from "../src/config.js";

const ENV_PATH = process.env.ONBOARD_ENV_PATH ?? ".env";

function envHasWallet(): boolean {
  return !!config.agent.accountId && !!config.agent.privateKey;
}

function writeWalletToEnv(accountId: string, privateKey: string) {
  let current = "";
  try {
    current = readFileSync(ENV_PATH, "utf8");
  } catch {
    current = "";
  }

  const lines = current.split("\n").filter((l) => !/^AGENT_(ACCOUNT_ID|PRIVATE_KEY)=/.test(l));
  lines.push(`AGENT_ACCOUNT_ID=${accountId}`);
  lines.push(`AGENT_PRIVATE_KEY=${privateKey}`);
  writeFileSync(ENV_PATH, `${lines.filter(Boolean).join("\n")}\n`, { mode: 0o600 });
}

async function main() {
  const serviceUrl = process.env.AGENCIA_SERVICE_URL ?? config.agent.serviceUrl;
  console.log(`Agencia onboarding · ${serviceUrl}\n`);

  if (envHasWallet()) {
    console.log(`✓ wallet already configured: ${config.agent.accountId}`);
  } else {
    console.log("no wallet configured — requesting one from the service…");
    const issued = await requestWallet(serviceUrl);
    writeWalletToEnv(issued.accountId, issued.privateKey);
    console.log(`✓ issued ${issued.accountId} on ${issued.network}, funded with ${issued.fundedHbar} HBAR`);
    console.log(`✓ private key written to ${ENV_PATH} (never printed, never kept by the service)`);
    process.env.AGENT_ACCOUNT_ID = issued.accountId;
    process.env.AGENT_PRIVATE_KEY = issued.privateKey;
    config.agent.accountId = issued.accountId;
    config.agent.privateKey = issued.privateKey;
  }

  console.log();
  const agencia = await AgenciaClient.connect({
    serviceUrl,
    onStep: (step) => console.log(`  ${step}`),
  });

  try {
    console.log(`\nmaking one real paid call to prove the wallet works…\n`);
    const result = await agencia.call("hbar_price", { vs: "usd" });
    const price = JSON.parse(result.text) as { price: number };
    console.log(`\n✓ HBAR = $${price.price}`);
    console.log(`✓ paid ${result.receipt?.quotedHbar} HBAR`);
    if (result.receipt?.transaction) console.log(`✓ tx ${result.receipt.transaction}`);
    if (result.receipt?.hcs) console.log(`✓ HCS receipt #${result.receipt.hcs.sequenceNumber}`);
    console.log(`\nremaining budget ${agencia.remainingHbar} HBAR`);
    console.log(`\nYou are set up. Try:`);
    console.log(`  npm run goal "what is HBAR worth and who holds account 0.0.10500124?"`);
    console.log(`  npm run lease 30 2`);
  } finally {
    await agencia.close();
  }
}

main().catch((err) => {
  console.error(`\nonboarding failed: ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
