import { config } from "../src/config.js";
import { createHcsTopic, makeClient, mirrorTopicMessagesUrl } from "../src/hedera.js";

async function main() {
  const kind = process.argv[2] === "identity" ? "identity" : "audit";
  const client = makeClient(config.service.operatorId, config.service.operatorKey);
  const memo =
    kind === "identity"
      ? "Agencia agent identity registry (HCS-14)"
      : "Agencia x402 payment audit trail";
  const topicId = await createHcsTopic(client, memo);
  client.close();

  const envVar = kind === "identity" ? "AGENT_IDENTITY_TOPIC_ID" : "AGENCIA_HCS_TOPIC_ID";
  console.log(`Created ${kind} topic: ${topicId}`);
  console.log(`Add to .env:  ${envVar}=${topicId}`);
  console.log(`Mirror feed:  ${mirrorTopicMessagesUrl(topicId)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
