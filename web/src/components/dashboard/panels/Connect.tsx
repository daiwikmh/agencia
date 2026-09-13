import { useEffect, useState } from "react";
import { Badge, Card, SectionTitle } from "../ui.js";
import { C, FF_HEAD, FF_MONO } from "../theme.js";
import { useResource } from "../store.js";
import type { ManifestResp } from "../types.js";

type ClientId = "bridge" | "claude-code" | "claude-desktop" | "cursor" | "sdk" | "raw";

const FALLBACK_SERVICE_URL =
  import.meta.env.PUBLIC_SERVICE_URL ?? "https://agencia.reroute-stellarbackend.workers.dev";

const CLIENTS: { id: ClientId; label: string; pays: boolean }[] = [
  { id: "bridge", label: "Claude / Cursor + bridge", pays: true },
  { id: "claude-code", label: "Claude Code", pays: false },
  { id: "claude-desktop", label: "Claude Desktop", pays: false },
  { id: "cursor", label: "Cursor", pays: false },
  { id: "sdk", label: "Your own agent", pays: true },
  { id: "raw", label: "Raw JSON-RPC", pays: false },
];

interface OnboardInfo {
  enabled: boolean;
  network?: string;
  fundsHbar?: number;
  issuedLastHour?: number;
  maxPerHour?: number;
}

interface IssuedWallet {
  accountId?: string;
  privateKey?: string;
  fundedHbar?: number;
  error?: string;
}

export default function Connect() {
  const { data: manifestResp } = useResource<ManifestResp>("manifest");
  const [info, setInfo] = useState<OnboardInfo | null>(null);
  const [wallet, setWallet] = useState<IssuedWallet | null>(null);
  const [issuing, setIssuing] = useState(false);
  const [client, setClient] = useState<ClientId>("claude-code");
  const [copied, setCopied] = useState<string | null>(null);

  const mcpUrl = manifestResp?.manifest?.mcp.url ?? `${FALLBACK_SERVICE_URL}/mcp`;
  const origin = mcpUrl.replace(/\/mcp$/, "");
  const toolCount = manifestResp?.manifest?.resources.length ?? 0;

  useEffect(() => {
    fetch("/api/onboard")
      .then((r) => r.json())
      .then(setInfo)
      .catch(() => setInfo({ enabled: false }));
  }, []);

  const copy = async (label: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label);
      setTimeout(() => setCopied(null), 1900);
    } catch {
      setCopied(null);
    }
  };

  const issue = async () => {
    if (issuing) return;
    setIssuing(true);
    try {
      const res = await fetch("/api/onboard", { method: "POST" });
      const data = (await res.json()) as IssuedWallet;
      setWallet(data);
      if (data.privateKey) {
        await copy("env", `AGENT_ACCOUNT_ID=${data.accountId}\nAGENT_PRIVATE_KEY=${data.privateKey}`);
      }
    } catch (err) {
      setWallet({ error: String(err) });
    } finally {
      setIssuing(false);
    }
  };

  const snippets: Record<ClientId, { title: string; body: string; note: string }> = {
    bridge: {
      title: "Let Claude actually buy — run the paying bridge",
      body: `# 1. clone + install, then point it at this service
git clone https://github.com/daiwikmh/agencia && cd agencia && npm install
echo 'AGENCIA_SERVICE_URL=${origin}' >> .env

# 2. get a funded wallet (skip if you already have one in .env)
npm run onboard

# 3. add the bridge to Claude Code
claude mcp add agencia -- npx tsx /ABSOLUTE/PATH/agencia/src/client/bridge.ts

# Claude Desktop / Cursor — stdio entry instead:
{
  "mcpServers": {
    "agencia": {
      "command": "npx",
      "args": ["tsx", "/ABSOLUTE/PATH/agencia/src/client/bridge.ts"]
    }
  }
}`,
      note: "The bridge holds the wallet and answers the 402s locally, so the client just calls tools and gets results — each one ending with the HBAR paid and its HCS receipt. Ask it to run wallet_status to see which account is paying.",
    },
    "claude-code": {
      title: "One command",
      body: `claude mcp add --transport http agencia ${mcpUrl}`,
      note: "Then ask Claude to run `discover` — it lists every priced tool with no credentials.",
    },
    "claude-desktop": {
      title: "claude_desktop_config.json",
      body: `{
  "mcpServers": {
    "agencia": {
      "type": "http",
      "url": "${mcpUrl}"
    }
  }
}`,
      note: "Restart Claude Desktop after saving. Builds without remote MCP support need an stdio bridge such as `npx mcp-remote`.",
    },
    cursor: {
      title: "~/.cursor/mcp.json",
      body: `{
  "mcpServers": {
    "agencia": {
      "type": "streamable-http",
      "url": "${mcpUrl}"
    }
  }
}`,
      note: "Use .cursor/mcp.json in a project root to scope it to one repo. Cursor wants streamable-http; Claude Code wants http.",
    },
    sdk: {
      title: "The client that can actually pay",
      body: `import { AgenciaClient } from "agencia/client";

const agencia = await AgenciaClient.connect();   // discovers, funds a wallet if needed
const { text, receipt } = await agencia.call("hbar_price", { vs: "usd" });

console.log(receipt.transaction, receipt.hcs);   // settled on Hedera + HCS receipt`,
      note: "Handles the 402 handshake, signing, budget caps and receipts. The only path that completes a purchase.",
    },
    raw: {
      title: "Plain HTTP, no SDK",
      body: `curl -s -X POST ${mcpUrl} \\
  -H 'content-type: application/json' \\
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'

# a paid tool answers 402 with the exact quote:
curl -s -X POST ${mcpUrl} \\
  -H 'content-type: application/json' \\
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call",
       "params":{"name":"hbar_price","arguments":{"vs":"usd"}}}'`,
      note: "The 402 body carries amount, asset, payTo and the facilitator fee payer — everything needed to build the payment yourself.",
    },
  };

  const active = snippets[client];
  const activeClient = CLIENTS.find((c) => c.id === client);

  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <SectionTitle style={{ marginBottom: 0 }}>Point an agent at this service</SectionTitle>

      <Card pad="18px 24px">
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
          <span style={{ fontSize: 14, fontFamily: FF_HEAD, color: C.white }}>
            Two different wallets, on purpose
          </span>
          <Badge tone="neutral">read this first</Badge>
        </div>
        <p style={{ margin: 0, fontSize: 13, lineHeight: 1.7, color: C.muted }}>
          <strong style={{ color: C.ink }}>MetaMask</strong>, in the top right, signs you in — it
          maps your address to a Hedera account so this console knows who you are. It cannot pay:
          x402 settles with a partially-signed native Hedera transfer, and MetaMask only signs
          Ethereum-prefixed messages.{" "}
          <strong style={{ color: C.ink }}>The Hedera keypair below</strong> is what actually buys —
          you hand it to the MCP bridge, which answers the 402s on your client's behalf. Issue it
          once, keep it local, and never paste it into this dashboard.
        </p>
      </Card>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))",
          gap: 16,
          alignItems: "start",
        }}
      >
        <Card pad="22px 24px">
          <StepHead n={1} title="Get a funded wallet" />
          <p style={{ margin: "0 0 16px", fontSize: 13.5, lineHeight: 1.6, color: C.muted }}>
            An agent needs one credential: a Hedera keypair. No signup, no API key. The service mints
            a testnet account, funds it{info?.fundsHbar ? ` with ${info.fundsHbar} ℏ` : ""} and keeps
            no copy of the key.
          </p>

          <button
            className="ag-btn"
            onClick={issue}
            disabled={issuing || !info?.enabled}
            style={{ background: C.accent, color: "#FFFFFF" }}
          >
            {issuing ? <span className="ag-spinner" /> : <span>◈</span>}
            <span>{issuing ? "Creating account…" : "Issue a wallet"}</span>
          </button>

          {info && !info.enabled && (
            <div style={{ marginTop: 12 }}>
              <Badge tone="warn">onboarding disabled on this service</Badge>
            </div>
          )}

          {wallet?.accountId && (
            <div style={{ marginTop: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <span style={{ fontSize: 15, fontFamily: FF_HEAD, color: C.white }}>
                  {wallet.accountId}
                </span>
                <Badge tone="pass">{wallet.fundedHbar} ℏ funded</Badge>
              </div>
              <p style={{ margin: "10px 0 0", fontSize: 12.5, lineHeight: 1.6, color: C.muted }}>
                {copied === "env"
                  ? "Credentials copied to your clipboard — paste them into your .env now. The key is shown nowhere and cannot be re-issued."
                  : "Copy the credentials into your .env — the key cannot be re-issued."}
              </p>
              {copied !== "env" && (
                <button
                  className="ag-btn"
                  style={{ background: C.navy, color: C.ink, marginTop: 10 }}
                  onClick={() =>
                    copy("env", `AGENT_ACCOUNT_ID=${wallet.accountId}\nAGENT_PRIVATE_KEY=${wallet.privateKey}`)
                  }
                >
                  Copy .env lines
                </button>
              )}
            </div>
          )}

          {wallet?.error && (
            <div style={{ marginTop: 14, fontSize: 12.5, color: C.red, fontFamily: FF_MONO }}>
              {wallet.error}
            </div>
          )}

          {info?.enabled && (
            <div style={{ marginTop: 14, fontSize: 11.5, color: C.faint, fontFamily: FF_MONO }}>
              {info.issuedLastHour ?? 0}/{info.maxPerHour ?? 0} issued this hour · {info.network}
            </div>
          )}
        </Card>

        <Card pad="22px 24px">
          <StepHead n={2} title="What a client can do" />
          <Row ok>List all {toolCount} tools, read prices and parameters</Row>
          <Row ok>
            Call the free tools: <code>discover</code>, <code>compute_providers</code>
          </Row>
          <Row ok>Call a paid tool and receive the exact 402 quote</Row>
          <Row>Complete the purchase — needs x402 support</Row>
          <p style={{ margin: "12px 0 0", fontSize: 12.5, lineHeight: 1.6, color: C.muted }}>
            A paid call answers <code>402</code> with amount, payTo and fee payer, then stops. That is
            the protocol working, not an error.
          </p>

          <div style={{ height: 1, background: C.border, margin: "16px 0" }} />

          <Copyable label="MCP endpoint" value={mcpUrl} onCopy={copy} copied={copied} />
          <Copyable label="Discovery" value={`${origin}/.well-known/x402`} onCopy={copy} copied={copied} />
          <Copyable label="Hardware" value={`${origin}/compute/inventory`} onCopy={copy} copied={copied} />
        </Card>

        <Card pad="22px 24px">
          <StepHead n={3} title="From a terminal" />
          <Mono>npm run onboard</Mono>
          <Note>wallet + one real paid call</Note>
          <Mono>npm run find</Mono>
          <Note>find services on-chain, buy the cheapest</Note>
          <Mono>npm run goal "what is HBAR worth?"</Mono>
          <Note>agent picks its own tools</Note>
          <Mono>npm run lease 30 2</Mono>
          <Note>rent hardware, exec, tick, close</Note>
          <Mono>npm run supplier</Mono>
          <Note>offer your machine to the marketplace</Note>
        </Card>
      </div>

      <Card pad="22px 24px">
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
          <StepHead n={4} title="Connect your client" inline />
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginLeft: "auto" }}>
            {CLIENTS.map((c) => (
              <button
                key={c.id}
                className="ag-btn"
                onClick={() => setClient(c.id)}
                style={{
                  background: client === c.id ? C.white : C.navy,
                  color: client === c.id ? "#FFFFFF" : C.muted,
                }}
              >
                {c.label}
                {c.pays && <span style={{ fontSize: 10, opacity: 0.7 }}>can pay</span>}
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 14, fontWeight: 500, color: C.white, fontFamily: FF_HEAD }}>
            {active.title}
          </span>
          {activeClient?.pays ? (
            <Badge tone="pass">completes payment</Badge>
          ) : (
            <Badge tone="warn">discovery only</Badge>
          )}
          <button
            className="ag-btn"
            style={{ marginLeft: "auto", background: C.navy, color: C.ink }}
            onClick={() => copy(client, active.body)}
          >
            {copied === client ? "copied" : "Copy"}
          </button>
        </div>

        <pre
          style={{
            margin: 0,
            background: C.navy,
            borderRadius: 16,
            padding: 16,
            fontSize: 12.5,
            lineHeight: 1.65,
            color: C.ink,
            fontFamily: FF_MONO,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            overflowX: "auto",
          }}
        >
          {active.body}
        </pre>
        <p style={{ margin: "12px 0 0", fontSize: 12.5, lineHeight: 1.6, color: C.muted }}>
          {active.note}
        </p>
      </Card>
    </section>
  );
}

function StepHead({ n, title, inline = false }: { n: number; title: string; inline?: boolean }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        marginBottom: inline ? 0 : 14,
      }}
    >
      <span
        style={{
          width: 30,
          height: 30,
          borderRadius: "50%",
          background: C.white,
          color: "#FFFFFF",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 13,
          fontFamily: FF_HEAD,
          flexShrink: 0,
        }}
      >
        {n}
      </span>
      <span
        style={{
          fontSize: 16.5,
          fontWeight: 500,
          color: C.white,
          fontFamily: FF_HEAD,
          letterSpacing: "-0.02em",
        }}
      >
        {title}
      </span>
    </div>
  );
}

function Row({ children, ok = false }: { children: React.ReactNode; ok?: boolean }) {
  return (
    <div style={{ display: "flex", gap: 9, alignItems: "flex-start", padding: "4px 0" }}>
      <span style={{ color: ok ? C.green : C.amber, fontSize: 13, lineHeight: 1.6 }}>
        {ok ? "✓" : "✕"}
      </span>
      <span style={{ fontSize: 13, lineHeight: 1.6, color: C.ink }}>{children}</span>
    </div>
  );
}

function Mono({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontFamily: FF_MONO,
        fontSize: 12.5,
        color: C.ink,
        background: C.navy,
        borderRadius: 12,
        padding: "8px 12px",
        marginTop: 10,
        wordBreak: "break-all",
      }}
    >
      {children}
    </div>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 11.5, color: C.faint, fontFamily: FF_MONO, marginTop: 4 }}>{children}</div>
  );
}

function Copyable({
  label,
  value,
  onCopy,
  copied,
}: {
  label: string;
  value: string;
  onCopy: (label: string, value: string) => void;
  copied: string | null;
}) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 11.5, color: C.muted, fontFamily: FF_MONO, marginBottom: 5 }}>
        {label}
      </div>
      <button
        className="ag-row"
        onClick={() => onCopy(label, value)}
        style={{
          background: C.navy,
          borderRadius: 12,
          padding: "9px 12px",
          fontSize: 12,
          fontFamily: FF_MONO,
          color: C.ink,
          display: "flex",
          alignItems: "center",
          gap: 10,
          width: "100%",
          wordBreak: "break-all",
        }}
      >
        <span style={{ flex: 1, textAlign: "left" }}>{value}</span>
        <span style={{ fontSize: 10.5, color: copied === label ? C.green : C.faint, flexShrink: 0 }}>
          {copied === label ? "copied" : "copy"}
        </span>
      </button>
    </div>
  );
}
