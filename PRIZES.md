# Prize submissions — Agencia

Repo: `https://github.com/daiwikmh/agencia` · Branch: `main`
Dashboard: https://0xagencia.vercel.app · Service: https://agencia.reroute-stellarbackend.workers.dev

---

## The Graph — $15,000

### How are you using this Protocol / API?

Agencia turns subgraph data into something an autonomous agent can **buy per query**, with no API key and no account. Four MCP tools sit on The Graph — `graph_query` (raw GraphQL), `graph_schema` (introspection), `graph_ask` (plain-English question → generated GraphQL → live data → written answer), and `graph_analyze`, which pulls live subgraph rows, rents a sandboxed container by the CPU-second, writes a program for your specific question, runs it on that box, and explains the result. Each one is priced in HBAR and settles on Hedera per call.

The interesting bit is that we don't treat The Graph as a read endpoint — we treat it as the **input to computation an agent pays for**. `graph_analyze` is the only way we know of to go from "what's the TVL concentration in this pool set?" to an actual computed answer in one paid call, and it only works because live subgraph data and rentable compute are both purchasable on the same rail.

### Link to the line of code where the tech is used

Primary — gateway resolution, auth and query execution:
- **`src/service/capabilities/graph.ts:13`** — `resolveEndpoint()`: bare subgraph id → gateway URL + `Authorization: Bearer` header
- **`src/service/capabilities/graph.ts:28`** — `queryGraph()`, the actual `fetch` against the gateway
- **`src/service/capabilities/graph.ts:76`** — `introspectSchema()`
- **`src/service/capabilities/graph.ts:181`** — `askGraph()`, natural language → GraphQL → answer

The Graph × compute pipeline:
- **`src/service/capabilities/graph-analyze.ts:115`** — `analyzeSubgraph()`: introspect → generate query → `queryGraph` → open lease → exec → explain

Where the four tools are registered and priced:
- **`src/service/mcp/tools/graph.ts:15`** (`graph_schema`), **`:35`** (`graph_ask`), **`:60`** (`graph_analyze`), **`:99`** (`graph_query`)

### How easy is it to use the API / Protocol? (1–10)

**7**

Straight GraphQL over HTTPS with a bearer token is about as easy as an integration gets, and standard introspection meant we got schema discovery for free. The points that cost us time were all *around* the query, not in it: getting from "a subgraph exists" to "here is its id and endpoint" programmatically, and reconciling two different auth conventions in the docs.

### Additional feedback for the Sponsor

**1. Two auth conventions still live side by side in docs and examples.** The gateway takes the key in an `Authorization: Bearer` header, but a lot of material still shows the older key-in-path form (`/api/<key>/subgraphs/id/...`). We ended up supporting both and writing a redactor for the path form specifically so a key couldn't leak into an error message or a log line (`src/service/capabilities/graph.ts:3`). Picking one and sweeping the docs would remove a real footgun — key-in-URL means the key lands in logs, referrers and error traces by default.

**2. The biggest gap for agent use cases: there is no machine-readable way to find a subgraph.** An autonomous agent cannot browse Graph Explorer. Right now a human has to go find the subgraph id and hand it over, which breaks the entire premise of an agent that discovers what it needs at runtime. A simple search/lookup endpoint — query by name, chain, or contract address, returning ids and endpoints as JSON — would unlock a category of consumer you don't currently have. This is the single change that would most increase our usage of The Graph.

**3. Introspection results are enormous, and LLMs pay by the token.** A full introspection on a large subgraph is far more than a model needs to write one query, and we had to trim it ourselves before it was usable as prompt context. A lightweight introspection mode — entity names, field names and types only, no descriptions or directives — would cut the cost of every "generate a query for me" workflow. Given how many people are now pointing models at subgraphs, this feels broadly useful.

**4. A documented note on junk data would prevent confidently wrong analytics.** Ordering Uniswap V3 pools by `totalValueLockedUSD` surfaces spam pools with absurd valuations. Our first `graph_analyze` run returned "top 3 pools hold 99.82% of TVL" — arithmetically correct, completely meaningless, because the input was garbage. We caught it and documented it, but a model generating queries will hit this constantly and will not catch it. A short "filtering guidance" section in popular subgraph docs (prefer `volumeUSD`, use a token whitelist, watch for unverified tokens) would meaningfully improve output quality across every AI-generated query.

**5. Rate limit semantics aren't obvious.** We couldn't easily determine our limits or see remaining quota. Standard `RateLimit-*` response headers would let us back off properly instead of guessing with a 10s timeout.

---

## Hedera — $15,000

### How are you using this Protocol / API?

Hedera is the entire settlement, audit and discovery layer — and we did it **without deploying a single smart contract**. Payments are native `TransferTransaction`s gated by x402 v2 (`exact` scheme) through the Blocky402 facilitator, so an agent pays a fraction of a cent for one API call and it settles in under a second. Every settlement — both the consumer's payment and the supplier's payout — writes a receipt to a Hedera Consensus Service topic, so the audit trail is immutable and the dashboard's usage charts are derived from the chain rather than from our own database.

We also use HCS as a **service registry**: a service announces itself to a public topic, and an agent that knows only the topic id reads the registry off the mirror node, picks a service, fetches its catalog and pays it — no URL, no config, no integration. On top of that: `AccountCreateTransaction` for one-command wallet onboarding, `ScheduleCreateTransaction` as a second payment rail for time-based billing, and the mirror node REST API behind six paid on-chain data tools.

### Link to the line of code where the tech is used

The payment spine — 402 → verify → run → settle → HCS receipt, wrapping every paid tool:
- **`src/service/payments/paid-tool.ts:72`** — `registerPaidTool()`

Settlement and the fee-payer handshake:
- **`src/facilitator.ts:14`** — `facilitatorFeePayer()`: fetches the facilitator's fee payer so the agent authorises a transfer **without paying the network fee**
- **`src/agent/wallet.ts:17`** — `createClientHederaSigner` / `ExactHederaScheme`
- **`src/agent/wallet.ts:47`** — `createPayment()`, builds and partially signs the transfer

HCS — audit trail and registry:
- **`src/service/audit/hcs.ts:14`** — `recordSettlement()`, one receipt per payment
- **`src/hedera.ts:77`** — `submitHcsMessage()` (`TopicMessageSubmitTransaction`)
- **`src/service/registry/announce.ts:55`** — `announceService()`, HCS as a public service registry

Accounts and the second rail:
- **`src/hedera.ts:46`** — `createFundedAccount()` (`AccountCreateTransaction`), one-command onboarding
- **`src/agent/stream.ts:48`** — `ScheduleCreateTransaction` for streamed / scheduled payments

Live topics: audit `0.0.10500159` · registry `0.0.10521746` · treasury `0.0.10500124`

### How easy is it to use the API / Protocol? (1–10)

**8**

The mirror node is the best part of the stack — keyless, fast, well documented, and it let us ship six on-chain data tools with almost no friction. HCS is genuinely trivial to use and turned out to be far more powerful than we expected. One real pain (below) kept this off a 9.

### Additional feedback for the Sponsor

**1. The JS SDK does not work on Cloudflare Workers, and this is the thing to fix.** `@hashgraph/sdk` sniffs for a browser environment and hard-fails inside a Workers isolate. We deployed anyway, but only by injecting fakes before the imports run:

```js
const globals = globalThis;
if (!globals.window) globals.window = globals;
if (!globals.document) globals.document = { location: { href: "https://…/" } };
// …imports must come AFTER these lines
```

Because those assignments have to execute *before* the import block, they sit above the imports where every linter and auto-formatter wants to relocate them — and relocating them silently breaks production. We added a `hasWindow` field to `/health` purely so we could verify from the outside that the hack was still holding (`worker/index.ts:3-4`, `worker/index.ts:56`).

Edge runtimes are where agent infrastructure is being built right now. A documented edge build, or a `@hashgraph/sdk/edge` entrypoint that skips environment detection, would remove the single largest obstacle we hit with Hedera.

**2. Key format handling needs one function that actually works.** ECDSA vs ED25519, DER vs raw hex, `0x`-prefixed vs not — we wrote our own `parseKey` that tries several forms (`src/hedera.ts:12`) because no single SDK constructor reliably handled every shape a real user pastes in. A `PrivateKey.fromStringAuto` that genuinely covers all of these would save every project this same helper.

**3. HCS is underrated and under-marketed.** The docs frame it as messaging and ordering. We used it as an append-only audit log *and* as a decentralised service registry, and replaced what would otherwise have been a smart contract plus a database. A "HCS as a registry / append-only index" pattern page — with guidance on message size, mirror-node read patterns and pagination — would help people discover that they often don't need a contract at all. That framing is a genuine differentiator against EVM chains and it's currently buried.

**4. Scheduled Transactions deserve more examples.** They're an excellent fit for streaming and subscription payments and we used them as our second rail, but there's very little example code relative to how useful they are. A worked "metered billing with Scheduled Transactions" example would land well.

**5. What already works great, so you don't change it:** mirror node REST (keyless and fast — this made six of our tools possible), sub-second finality, and predictable fees. Being able to charge 0.002 ℏ for a call and have it actually settle is the reason this project exists; on most chains the fee would exceed the price of the product.
