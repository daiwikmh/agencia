# Demo runbook — 5 minutes

The brief is four claims. Each maps to one tab, in order. The through-line to say once, at the start:

> **The only credential anywhere in this demo is a Hedera keypair.**

---

## Pre-flight (do this *before* you hit record)

```bash
open -a OrbStack                                    # 1. docker daemon — this has broken the demo twice
cd hedera/agencia

npm run start                                       # 2. service on :3022

SUPPLIER_LABEL="Daiwi rig (16-core M-series)" \
SUPPLIER_RATE_PER_SECOND_HBAR=0.0004 \
npm run supplier                                    # 3. supplier on :3099

cd web && npm run dev                               # 4. dashboard on :4321
```

Then verify all four in one shot:

```bash
curl -s localhost:3022/compute/inventory | python3 -c "
import sys,json; d=json.load(sys.stdin)
for p in d['providers']: print(p['id'], p['label'], 'ONLINE' if p['available'] else 'OFFLINE')"
```

You want **two providers, both ONLINE**. If the supplier shows `pending` instead, allowlist it once (it persists):

```bash
curl -s -X POST localhost:3022/providers/<supplier-id>/status \
  -H "authorization: Bearer $COMPUTE_ADMIN_TOKEN" \
  -H 'content-type: application/json' -d '{"status":"allowlisted"}'
```

**Check the wallet has ≥ 2 ℏ** (the corner menu shows it). A full demo spends roughly 0.4 ℏ.

**Pre-warm the model.** The first NIM call of the session is slow. Run one throwaway goal before recording:

```bash
npm run goal "what is HBAR worth right now?"
```

---

## The script

### 0:00 — 0:30 · The problem

Dashboard on **Catalog**. 16 priced tools, 8 categories.

> "Buying an API means an account, a card, a subscription. None of that works for an agent. Here every tool is priced per call, and the only thing a caller needs is a Hedera keypair."

Point at the per-unit pricing: `infer` scales with tokens, `compute_lease` with CPU-seconds. Not a flat tax.

### 0:30 — 1:15 · No signup — **Connect** tab

1. Click **Issue a wallet** → a real funded testnet account appears.
2. Show the MCP endpoint URL and say the honest caveat out loud:

> "Any MCP client can connect and list every tool with no credentials. But a paid call answers 402 and stops there — completing the purchase needs an x402-capable client, which is the three-line snippet in step three."

### 1:15 — 2:45 · **Live run** → *Give it a goal* ← the money shot

Prompt: `what is HBAR worth right now, and how much HBAR does account 0.0.10500124 hold?`

Narrate as the cards stream in:

- **402 · the agent buys its own reasoning** — *"it has no API key, not even for its own thinking. It pays for that through the same rail."*
- **Turn 1 · agent decided** — *"nobody told it `hbar_price` exists. It read the catalog thirty seconds ago."*
- each **Settled through Blocky402** — point at the HCS receipt number climbing.

Land it: ~5 settlements, one answer, every step receipted.

### 2:45 — 4:10 · Metered hardware — **Compute** tab

1. The inventory card: **10 vCPU · 8 GB · docker 29.4.0**, read live from the daemon — plus the supplier beside it with its own asking rate and payout account.
2. **Pay & lease** (60s) → watch `402 → settled → lease open`.
3. In the terminal, run something that proves it's real hardware:
   ```
   node -e "console.log(process.version, require('os').cpus().length + ' cpu')"
   ```
   > "Execution is free. You pay for seconds, not commands."
4. Point at **stream payments** — a tick settles every 10 seconds, each its own HCS receipt. *"Stop paying and the box is reaped."*
5. **End lease** → the supplier payout fires on-chain, 70/30, with its own receipt.

> "Two legs, both on Hedera: the consumer pays x402, the supplier gets paid HBAR. We never integrated a vendor — suppliers integrate us."

### 4:10 — 4:35 · **HCS audit trail**

Scroll the receipts. Open one on HashScan.

> "Every payment in this demo, and every payout, is on that topic. Anyone can verify it — you don't have to trust the dashboard."

### 4:35 — 5:00 · It's deployed

Terminal:

```bash
curl -s https://agencia.reroute-stellarbackend.workers.dev/health
AGENCIA_SERVICE_URL=https://agencia.reroute-stellarbackend.workers.dev \
  npm run agent "say hello from the edge"
```

> "The service runs on Cloudflare Workers — no Node in the request path. It still writes its HCS receipt from the edge."

---

## Landmines

| Risk | Prevention |
|---|---|
| **OrbStack not running** → "no hardware online", lease button disabled | Start it first. It has bitten us twice. |
| **Demoing `hbar_price` against the Worker URL** | CoinGecko 403s Cloudflare egress. Use the *local* service for price tools, or use `hedera_network` on the edge. |
| **Restarting the service mid-demo** | Leases are in-memory; a restart forgets them and the boot sweep kills the container. |
| **Leaving auto-tick running while you talk** | It spends 0.015 ℏ every 10 seconds. End the lease before moving on. |
| **Cold NIM call** | Pre-warm. The first inference of a session can take 10s+. |
| **Compute on the deployed Worker** | Not available by design — Workers can't run containers. Demo compute locally; the manifest says so explicitly. |

## Fallbacks, if something dies live

- **Goal agent stalls or returns junk** → switch Live run to **Paid call** mode. Same timeline, same 402 → settle → receipt, no model in the loop.
- **Docker down and you can't restart it** → skip the lease. Show the Compute inventory + provider directory tables instead and talk through the marketplace.
- **NIM slow or erroring** → `hedera_network` is cheap, fast, and has no third-party dependency.
- **Dashboard wedged** → the CLI tells the same story: `npm run lease 30 2` prints 402 → settled → ticks → payout.

## What not to claim

- Don't say "any MCP client can pay" — it can discover and call; paying needs x402 support.
- Don't say compute runs on Cloudflare — it runs on supplier nodes.
- Don't call the lease durable — a service restart forgets it.
