# Agencia — hackathon submission copy

Paste-ready. Character counts verified.

---

## Short description  *(max 100 characters)*

**Use this one — 89 characters:**

```
Your agent can't get an API key. So it pays per call instead — in HBAR. Even for compute.
```

Alternates, all verified under the limit:

| Chars | Text |
|---:|---|
| 91 | `Your agent shows up, sees a price, pays it, gets the thing. Even a Linux box by the second.` |
| 92 | `Agents buy APIs, data and real hardware by the second, per call, in HBAR. No key. No signup.` |
| 94 | `Connect your agent to every service it needs. Even compute. Pay-per-call in HBAR, no API keys.` |

The first one is the pick because it states the problem and the fix in two beats, and "even for compute" is the part judges won't expect.

---

## Description  *(min 280 characters)*

> **Connect your agent to every service it needs. Even compute.**

Your agent needs an API key. It can't get one. It can't sign up, can't enter a card, can't agree to terms. So it sits there while you go create accounts for it.

Agencia deletes that whole step. Your agent shows up, sees a price, pays it, gets the thing. One call, one payment, done in under a second for a fraction of a cent. No account. No key. No subscription burning money while you sleep.

It brings its own wallet and buys what it needs: reasoning, on-chain data, prices, web pages, live subgraph queries. And — the part nobody expects — **actual hardware**. Your agent can rent a real Linux box by the second, run code on it, and hand it back. Not a quota. Not a plan. A machine, for eleven seconds, because that's how long it needed one.

That changes what an agent can be. It stops being a thing that calls APIs you pre-arranged and becomes a thing that goes and gets what it needs, including compute it can think on.

The economics go both ways. Have a machine sitting idle? Point it at Agencia, name your rate, get paid in HBAR every second someone uses it. Payouts land on-chain automatically when the lease closes.

And it's all receipts. Every payment — yours and the supplier's — is written to a public consensus log. You can audit every cent your agent spent without trusting our dashboard, because the dashboard reads the same chain you do.

The wildest part: your agent doesn't need to be told where anything *is*. Services announce themselves to a public topic on Hedera. Give an agent nothing but that topic and it'll find a service, read its menu, and pay it. No URL, no config, no integration.

We built one that does exactly that. It buys its own reasoning, decides what to look up, and answers. Nobody told it which tools existed.

---

## How it's made  *(min 280 characters)*

TypeScript the whole way down. Node + Hono for the service, the official MCP SDK so any MCP client can see the tools, `@x402/core` and `@x402/hedera` for payments, `@hashgraph/sdk` for chain work, NVIDIA NIM behind the inference tools, Docker for the sandboxes. Dashboard is Astro 5 with React islands on Vercel. The whole service also runs on Cloudflare Workers.

**Everything hangs off one function.** `registerPaidTool` wraps a tool in the same five beats: 402 with a quote, verify, run, settle, write the receipt. Every paid tool in the catalog goes through it. Adding one is a name, a schema, a price function, a run function — four things, and you get payments, settlement and an audit trail for free. It's also why the pricing is honest: `price(args)` runs against your actual arguments, so a small call costs less than a big one instead of everything costing "one request."

**No smart contracts, deliberately.** Payments are native `TransferTransaction`s, the audit trail is a consensus topic, and the service registry is another one — so a lookup is a mirror node read instead of a contract call, and a payment is a transfer instead of an execution. Nothing to deploy, nothing to upgrade, and a settlement costs a fraction of what the equivalent contract call would. That's the whole argument for doing this on Hedera rather than an EVM chain.

**The payment trick.** Naively, your agent pays the network fee to pay for a 0.002 ℏ call, which is silly. So the agent builds the transfer, points the transaction ID at the *facilitator's* fee payer, freezes it, and signs with only its own key. The facilitator co-signs and submits. Your agent authorises the money without paying the gas and without its key ever leaving the machine. That's the difference between micropayments working and micropayments being a cute idea.

**Where it got stupid:** the Hedera SDK sniffs for a browser and dies in a Workers isolate. Fix is four lines faking `window` and `document` — but they have to run *before* the imports, so they sit above the import block looking like a mistake, and every linter and auto-formatter wants to move them and break production. `/health` returns a `hasWindow` flag purely so we can prove from the outside that the hack is still holding.

**`graph_analyze` is the one we're smug about.** Six things, one payment: introspect the subgraph, a model writes the GraphQL, run it against live data, rent a container by the second, push the rows in, a model writes a program for *that specific question*, run it on the rented box, a model explains what came back. The script never leaves the container. If any of it fails you aren't charged, because it errors before settlement.

**Compute had to survive reality.** Leases persist to disk with their container handles, so restarting the service doesn't nuke someone's running box — live leases resume, only genuinely dead ones get reaped. Sandboxes are non-root, `cap-drop ALL`, no-new-privileges, read-only rootfs, capped on pids/CPU/memory. `compute_install` refuses to download anything on the first call; it tells you the exact command it would run and waits for you to say yes.

**And then there's the cat.** A cat walks across your macOS menu bar while a paid call is in flight, and sits down with its tail curled when nothing's being paid for. It's not a mock — `registerPaidTool` fires a loopback POST on verify and on settle, refcounted so two overlapping calls don't stop it early. Menu bar status items can't move, so it's a transparent click-through window floating over the bar, with a hand-drawn four-beat walk cycle whose leg phase is driven by distance instead of time so the feet don't skate. Idle costs 0.0% CPU — the timer is killed, not throttled.

Totally unnecessary. Also the fastest way to *feel* whether your payment rail is alive, which turned out to be genuinely useful while debugging.
