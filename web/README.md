# Agencia — Web

Astro (SSR, Node adapter) frontend for [Agencia](../README.md). Two pages:

- **`/`** — landing hero. Single inlined block (own `<head>`, inline `<style>`, one `is:inline` IIFE), no framework, no build-step CSS. Slide-in nav sheet, staggered entrance animation, full responsive matrix.
- **`/dashboard`** — a React island (`client:load`) in the Wormhole dark / single-accent style. It **reads the live Agencia service**:
  - `GET /api/health` → proxies the service `/health` (polled)
  - `GET /api/manifest` → proxies `/.well-known/x402`
  - `GET /api/audit` → decodes the HCS topic feed from the Hedera mirror node
  - `POST /api/infer` → runs the full x402 v2 paid flow **server-side** with `@x402/core` + `@x402/hedera`: discover → MCP call → 402 → build the partially-signed `TransferTransaction` (agent key) → retry with `X-PAYMENT` → Blocky402 verifies, co-signs as feePayer, and submits → return the answer + settlement receipt (+ HashScan link)

The agent private key stays server-side; the browser never sees it.

## Run

```bash
cp .env.example .env      # AGENCIA_SERVICE_URL + agent wallet + network
npm install
npm run dev               # http://localhost:4321

# production
npm run build && npm run preview
```

The Agencia service must be running (`cd .. && npm run server`) for the dashboard to show live data; every panel has an empty state when it is not.

## Server config (`.env`)

| Var | Purpose |
|---|---|
| `AGENCIA_SERVICE_URL` | the x402 service to consume (default `http://localhost:3022`) |
| `HEDERA_NETWORK` | `hedera-testnet` / `hedera-mainnet` |
| `HEDERA_MIRROR_NODE_URL` | mirror node for the audit feed |
| `HASHSCAN_BASE` | explorer base for tx links |
| `AGENT_ACCOUNT_ID` / `AGENT_PRIVATE_KEY` | the consuming agent's wallet (server-only) |
| `AGENT_BUDGET_HBAR` | per-call spend cap enforced before paying |

## Structure

```
src/
  pages/
    index.astro           landing hero (self-contained block)
    dashboard.astro        loads <Dashboard client:load />
    api/{health,manifest,audit,infer}.ts
  server/
    config.ts              env
    hedera.ts              agent client, HBAR transfer, mirror-node reads
    pay-flow.ts            discover → MCP → 402 → pay → retry → receipt
  components/dashboard/
    Dashboard.tsx  ui.tsx  GlobalStyle.tsx  theme.ts
```
