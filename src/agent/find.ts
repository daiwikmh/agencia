import "../node-env.js";
import { AgenciaClient } from "../client/index.js";
import { config } from "../config.js";
import { discoverOnChain } from "./discover.js";

async function main() {
  const topicId = process.argv[2] || config.registry.topicId;
  console.log(`[agent] reading the x402 service registry on HCS topic ${topicId}\n`);

  const services = await discoverOnChain(topicId);
  if (!services.length) {
    console.log("[agent] no services announced on that topic yet");
    return;
  }

  for (const s of services) {
    console.log(`  ${s.service} — ${s.network}`);
    console.log(`    origin    ${s.origin}`);
    console.log(`    mcp       ${s.mcp}`);
    console.log(`    payTo     ${s.payTo} (HBAR, ${s.facilitator})`);
    console.log(`    tools     ${s.toolCount} priced · from ${s.cheapestHbar} ℏ · ${s.categories.join(", ")}`);
    console.log(`    audit     ${s.auditTopicId ?? "none"}`);
    console.log(`    announced ${s.announcedAt} (#${s.sequenceNumber})\n`);
  }

  const target = services[0];
  console.log(`[agent] nobody gave me a URL — fetching ${target.service}'s catalog from its announcement\n`);

  const client = await AgenciaClient.connect({
    serviceUrl: target.origin,
    onStep: (step) => console.log(`  ${step}`),
  });
  try {
    const callableBlind = client.manifest.resources
      .filter((r) => !(r.params ?? []).some((p) => p.required) && r.pricing.perCallHbar > 0)
      .sort((a, b) => a.pricing.perCallHbar - b.pricing.perCallHbar);
    const cheapest = callableBlind[0];
    if (!cheapest) {
      console.log("[agent] nothing in this catalog is callable without arguments");
      return;
    }
    console.log(
      `[agent] ${callableBlind.length} tools need no arguments — cheapest is ${cheapest.tool} at ${cheapest.pricing.perCallHbar} ℏ\n`,
    );
    const result = await client.call(cheapest.tool, {});
    console.log(`\n[agent] paid ${result.receipt?.quotedHbar} ℏ`);
    if (result.receipt?.hcs) console.log(`[agent] HCS receipt #${result.receipt.hcs.sequenceNumber}`);
    console.log(`[agent] result: ${result.text.slice(0, 220)}`);
  } finally {
    await client.close();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
