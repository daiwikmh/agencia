import { config } from "../config.js";

export const ASCII = String.raw`
   ▄▀█ █▀▀ █▀▀ █▄░█ █▀▀ █ ▄▀█
   █▀█ █▄█ ██▄ █░▀█ █▄▄ █ █▀█
   pay-per-call services on hedera · x402
`;

export const ASCII_BOXED = String.raw`
╔════════════════════════════════════════════════════╗
║                                                    ║
║     ▄▀█ █▀▀ █▀▀ █▄░█ █▀▀ █ ▄▀█                     ║
║     █▀█ █▄█ ██▄ █░▀█ █▄▄ █ █▀█                     ║
║                                                    ║
║     pay-per-call services on Hedera, gated by      ║
║     x402. no API key. no subscription. no seat.    ║
║                                                    ║
╚════════════════════════════════════════════════════╝
`;

/**
 * Shown by MCP clients on connect (the protocol's `instructions` field), so the
 * first thing an agent or a human sees is how the money actually works.
 */
export function mcpInstructions(origin: string, toolCount: number): string {
  return `${ASCII_BOXED}
Every tool here is metered and paid per call in HBAR. There is no account to
create and no key to hold — the payment IS the authentication.

HOW A CALL WORKS
  1. tools/call a priced tool with no payment
     → answers 402 with the exact quote: amount, asset, payTo, feePayer
  2. build a Hedera TransferTransaction for that amount
     → set transactionId.accountId to the facilitator's feePayer
     → freeze and sign with YOUR key only (partial signature)
  3. tools/call again with _meta["x402/payment"] = base64(payload)
     → the facilitator co-signs, submits, and the result comes back
     → _meta["x402/payment-response"] carries the tx id + HCS receipt

FREE TOOLS (no payment, call these first)
  discover            the full manifest: every tool, its price and payTo
  compute_providers   hardware available to rent right now

${toolCount} priced tools · manifest at ${origin}/.well-known/x402
audit trail: every settled call is receipted on HCS topic ${config.service.hcsTopicId || "(unset)"}

RENTING HARDWARE
  compute_lease  { seconds, cpu, memMb }  → returns leaseId + leaseToken
  compute_exec   { leaseId, leaseToken, command }   covered by the lease
  compute_tick   { leaseId }              extends it, one settlement per tick
  compute_end    { leaseId, leaseToken }  stops the box
  Keep the leaseToken. It is what proves the box is yours.

IF YOUR CLIENT CANNOT PAY
  Claude Desktop, Cursor and most MCP clients will list these tools and receive
  the 402 quote, but cannot complete the payment. That is expected. Use the
  bundled client (AgenciaClient) or any x402-capable agent to actually buy.`;
}

export function bootBanner(port: number): string {
  return `${ASCII_BOXED}
  service      http://localhost:${port}
  discovery    http://localhost:${port}/.well-known/x402
  mcp          http://localhost:${port}/mcp
  network      ${config.network}
  payTo        ${config.service.payTo || "(unset)"}
  audit topic  ${config.service.hcsTopicId || "(unset)"}`;
}
