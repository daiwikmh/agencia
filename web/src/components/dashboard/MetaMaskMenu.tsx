import { useEffect, useRef, useState } from "react";
import { C, FF_HEAD, FF_MONO } from "./theme.js";
import { Badge } from "./ui.js";
import { fmtHbar } from "./format.js";
import { useMetaMask } from "./useMetaMask.js";

const FOX = "🦊";

interface Issued {
  accountId?: string;
  privateKey?: string;
  fundedHbar?: number;
  error?: string;
}

function shortAddress(value: string): string {
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}

export default function MetaMaskMenu() {
  const {
    address,
    connecting,
    error,
    identity,
    connected,
    wrongChain,
    connect,
    disconnect,
    refreshIdentity,
  } = useMetaMask();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [issuing, setIssuing] = useState(false);
  const [issued, setIssued] = useState<Issued | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const copy = async (label: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label);
      setTimeout(() => setCopied(null), 1800);
    } catch {
      setCopied(null);
    }
  };

  const issue = async () => {
    if (issuing) return;
    setIssuing(true);
    try {
      const res = await fetch("/api/onboard", { method: "POST" });
      setIssued((await res.json()) as Issued);
    } catch (err) {
      setIssued({ error: String(err) });
    } finally {
      setIssuing(false);
    }
  };

  const label = () => {
    if (connecting) return "Connecting…";
    if (!connected) return "Connect MetaMask";
    if (wrongChain) return "Wrong network";
    if (identity.state === "resolving") return "Resolving…";
    if (identity.state === "found" && identity.balanceHbar != null) {
      return `${identity.balanceHbar.toFixed(4)} ℏ`;
    }
    if (identity.state === "inactive") return "No Hedera account";
    return shortAddress(address ?? "");
  };

  const dotColor = () => {
    if (!connected) return "#FFFFFF";
    if (wrongChain || identity.state === "error") return C.red;
    if (identity.state === "found") return C.green;
    return C.amber;
  };

  return (
    <div ref={rootRef} style={{ position: "relative", flexShrink: 0 }}>
      <button
        onClick={() => (connected ? setOpen((v) => !v) : void connect())}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 9,
          background: connected ? C.white : C.accent,
          color: "#FFFFFF",
          border: "none",
          borderRadius: 999,
          padding: "10px 16px",
          cursor: "pointer",
          fontSize: 13,
          fontFamily: FF_HEAD,
        }}
      >
        {connected ? (
          <span
            style={{
              width: 7,
              height: 7,
              borderRadius: "50%",
              background: dotColor(),
              flexShrink: 0,
            }}
          />
        ) : (
          <span style={{ fontSize: 13 }}>{FOX}</span>
        )}
        {connected && (
          <span style={{ opacity: 0.55, fontSize: 11 }}>{shortAddress(address ?? "")}</span>
        )}
        <span>{label()}</span>
        {connected && <span style={{ fontSize: 9, opacity: 0.6 }}>{open ? "▲" : "▼"}</span>}
      </button>

      {!connected && error && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 8px)",
            right: 0,
            width: 260,
            fontSize: 11.5,
            color: C.red,
            fontFamily: FF_MONO,
            background: C.card,
            borderRadius: 14,
            padding: "10px 12px",
            boxShadow: "0 12px 30px rgba(22,28,40,0.14)",
            zIndex: 70,
          }}
        >
          {error}
        </div>
      )}

      {open && connected && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 10px)",
            right: 0,
            width: 340,
            background: C.card,
            borderRadius: 22,
            boxShadow: "0 18px 48px rgba(22,28,40,0.18)",
            padding: 20,
            zIndex: 70,
            animation: "ag-fade .16s ease",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
            <span style={{ fontSize: 15, fontFamily: FF_HEAD, color: C.white }}>
              {identity.accountId ?? shortAddress(address ?? "")}
            </span>
            <Badge tone={wrongChain ? "breach" : "pass"}>
              {wrongChain ? "wrong chain" : "testnet"}
            </Badge>
          </div>

          {wrongChain ? (
            <p style={{ margin: "0 0 14px", fontSize: 13, lineHeight: 1.6, color: C.muted }}>
              MetaMask is on another network. Switch it to Hedera Testnet (chain 296) to identify
              this account.
            </p>
          ) : identity.state === "inactive" ? (
            <p style={{ margin: "0 0 14px", fontSize: 13, lineHeight: 1.6, color: C.muted }}>
              This address has no Hedera account yet — it activates the first time it receives HBAR.
              Issue a funded testnet account below to get started.
            </p>
          ) : (
            <>
              <div
                style={{
                  fontSize: 30,
                  fontFamily: FF_HEAD,
                  fontWeight: 400,
                  letterSpacing: "-0.04em",
                  color: C.white,
                  margin: "10px 0 2px",
                }}
              >
                {identity.balanceHbar != null ? fmtHbar(identity.balanceHbar) : "—"}
              </div>
              <div style={{ fontSize: 12, color: C.faint, fontFamily: FF_MONO }}>
                signed in with MetaMask
              </div>
            </>
          )}

          <div style={{ height: 1, background: C.border, margin: "16px 0" }} />

          <Row label="EVM address" value={shortAddress(address ?? "")} />
          <Row label="Hedera account" value={identity.accountId ?? "not activated"} />
          <Row label="Network" value="hedera:testnet · 296" />

          <div style={{ height: 1, background: C.border, margin: "16px 0" }} />

          <p style={{ margin: "0 0 14px", fontSize: 12, lineHeight: 1.6, color: C.muted }}>
            MetaMask identifies you here. It cannot sign x402 payments — those need a native Hedera
            transfer signature — so paid calls run through the MCP bridge with your own Hedera key.
          </p>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <Action onClick={() => copy("address", address ?? "")}>
              {copied === "address" ? "copied" : "Copy address"}
            </Action>
            <Action onClick={() => void refreshIdentity()}>Refresh</Action>
            {identity.accountId && (
              <Action href={`https://hashscan.io/testnet/account/${identity.accountId}`}>
                HashScan ↗
              </Action>
            )}
            <Action href="/dashboard/connect">Connect MCP</Action>
            <Action onClick={disconnect}>Disconnect</Action>
          </div>

          <div style={{ height: 1, background: C.border, margin: "16px 0" }} />

          <button
            className="ag-btn"
            onClick={issue}
            disabled={issuing}
            style={{ background: C.accent, color: "#FFFFFF" }}
          >
            {issuing ? <span className="ag-spinner" /> : <span>◈</span>}
            <span>{issuing ? "Creating…" : "Issue a funded wallet"}</span>
          </button>

          {issued?.accountId && (
            <div style={{ marginTop: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 14, fontFamily: FF_HEAD, color: C.white }}>
                  {issued.accountId}
                </span>
                <Badge tone="pass">{issued.fundedHbar} ℏ</Badge>
              </div>
              <p style={{ margin: "8px 0 0", fontSize: 12, lineHeight: 1.6, color: C.muted }}>
                {copied === "issued"
                  ? "Credentials copied — paste them into the MCP bridge's .env. They are shown once and cannot be re-issued."
                  : "Copy these into the MCP bridge's .env to let it pay on your behalf."}
              </p>
              {copied !== "issued" && (
                <button
                  className="ag-btn"
                  style={{ background: C.navy, color: C.ink, marginTop: 10 }}
                  onClick={() =>
                    copy(
                      "issued",
                      `AGENT_ACCOUNT_ID=${issued.accountId}\nAGENT_PRIVATE_KEY=${issued.privateKey}`,
                    )
                  }
                >
                  Copy .env lines
                </button>
              )}
            </div>
          )}

          {issued?.error && (
            <div style={{ marginTop: 12, fontSize: 12, color: C.red, fontFamily: FF_MONO }}>
              {issued.error}
            </div>
          )}

          {error && (
            <div style={{ marginTop: 12, fontSize: 12, color: C.red, fontFamily: FF_MONO }}>
              {error}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "5px 0" }}>
      <span style={{ fontSize: 12.5, color: C.muted, fontFamily: FF_MONO }}>{label}</span>
      <span style={{ fontSize: 12.5, color: C.ink, fontFamily: FF_MONO }}>{value}</span>
    </div>
  );
}

function Action({
  children,
  onClick,
  href,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  href?: string;
}) {
  const style = {
    background: C.navy,
    color: C.ink,
    borderRadius: 999,
    padding: "8px 14px",
    fontSize: 12.5,
    fontFamily: FF_MONO,
    border: "none",
    cursor: "pointer",
    textDecoration: "none",
    display: "inline-block",
  } as const;

  if (href) {
    return (
      <a
        href={href}
        style={style}
        {...(href.startsWith("http") ? { target: "_blank", rel: "noreferrer" } : {})}
      >
        {children}
      </a>
    );
  }
  return (
    <button onClick={onClick} style={style}>
      {children}
    </button>
  );
}
