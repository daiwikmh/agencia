import { useEffect, useState } from "react";
import { Badge, Card, SectionTitle } from "../ui.js";
import { C, FF_HEAD, FF_MONO } from "../theme.js";
import { useResource } from "../store.js";
import type { ManifestResp } from "../types.js";

interface OnboardInfo {
  enabled: boolean;
  network?: string;
  fundsHbar?: number;
  issuedLastHour?: number;
  maxPerHour?: number;
}

interface IssuedWallet {
  ok?: boolean;
  accountId?: string;
  privateKey?: string;
  fundedHbar?: number;
  network?: string;
  error?: string;
}

export default function Connect() {
  const { data: manifestResp } = useResource<ManifestResp>("manifest");
  const [info, setInfo] = useState<OnboardInfo | null>(null);
  const [wallet, setWallet] = useState<IssuedWallet | null>(null);
  const [issuing, setIssuing] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const mcpUrl = manifestResp?.manifest?.mcp.url ?? "—";

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
      setTimeout(() => setCopied(null), 2000);
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
        await copy(
          "env",
          `AGENT_ACCOUNT_ID=${data.accountId}\nAGENT_PRIVATE_KEY=${data.privateKey}`,
        );
      }
    } catch (err) {
      setWallet({ error: String(err) });
    } finally {
      setIssuing(false);
    }
  };

  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <SectionTitle style={{ marginBottom: 0 }}>Point an agent at this service</SectionTitle>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(330px,1fr))",
          gap: 16,
          alignItems: "start",
        }}
      >
        <Card>
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
                    copy(
                      "env",
                      `AGENT_ACCOUNT_ID=${wallet.accountId}\nAGENT_PRIVATE_KEY=${wallet.privateKey}`,
                    )
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

        <Card>
          <StepHead n={2} title="Connect over MCP" />
          <p style={{ margin: "0 0 14px", fontSize: 13.5, lineHeight: 1.6, color: C.muted }}>
            One URL, no credentials. Any MCP client can connect and list every priced tool.
          </p>
          <Copyable label="MCP endpoint" value={mcpUrl} onCopy={copy} copied={copied} />
          <Copyable
            label="Discovery document"
            value={`${mcpUrl.replace(/\/mcp$/, "")}/.well-known/x402`}
            onCopy={copy}
            copied={copied}
          />
          <div
            style={{
              marginTop: 14,
              padding: "12px 14px",
              borderRadius: 16,
              background: C.amberBg,
              fontSize: 12.5,
              lineHeight: 1.6,
              color: C.ink,
            }}
          >
            <strong style={{ fontFamily: FF_HEAD }}>Worth knowing:</strong> a generic MCP client can
            discover and call every tool, but a paid call answers with a 402 challenge and stops
            there. Completing the purchase needs an x402-capable client — step 3.
          </div>
        </Card>

        <Card>
          <StepHead n={3} title="Pay automatically" />
          <p style={{ margin: "0 0 14px", fontSize: 13.5, lineHeight: 1.6, color: C.muted }}>
            The bundled client handles discovery, the 402 handshake, signing and budget caps. Three
            lines and your agent is buying.
          </p>
          <Code>{`import { AgenciaClient } from "agencia/client";

const agencia = await AgenciaClient.connect();
const { text, receipt } = await agencia.call("hbar_price", { vs: "usd" });`}</Code>
          <div style={{ marginTop: 14 }}>
            <div style={miniLabel}>or from the terminal</div>
            <Code>{`npm run onboard                       # wallet + first paid call
npm run goal "what is HBAR worth?"    # agent picks its own tools
npm run lease 30 2                    # rent metered hardware`}</Code>
          </div>
        </Card>
      </div>
    </section>
  );
}

const miniLabel = {
  fontSize: 11.5,
  color: C.muted,
  fontFamily: FF_MONO,
  marginBottom: 7,
};

function StepHead({ n, title }: { n: number; title: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
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
      <span style={{ fontSize: 17, fontWeight: 500, color: C.white, fontFamily: FF_HEAD, letterSpacing: "-0.02em" }}>
        {title}
      </span>
    </div>
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
    <div style={{ marginBottom: 12 }}>
      <div style={miniLabel}>{label}</div>
      <button
        className="ag-row"
        onClick={() => onCopy(label, value)}
        style={{
          background: C.navy,
          borderRadius: 14,
          padding: "11px 14px",
          fontSize: 12.5,
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
        <span style={{ fontSize: 11, color: copied === label ? C.green : C.faint, flexShrink: 0 }}>
          {copied === label ? "copied" : "copy"}
        </span>
      </button>
    </div>
  );
}

function Code({ children }: { children: string }) {
  return (
    <pre
      style={{
        margin: 0,
        background: C.navy,
        borderRadius: 16,
        padding: 14,
        fontSize: 12,
        lineHeight: 1.65,
        color: C.ink,
        fontFamily: FF_MONO,
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
      }}
    >
      {children}
    </pre>
  );
}
