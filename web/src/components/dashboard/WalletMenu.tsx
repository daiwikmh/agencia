import { useEffect, useRef, useState } from "react";
import { C, FF_HEAD, FF_MONO } from "./theme.js";
import { Badge } from "./ui.js";
import { fmtHbar, shortId } from "./format.js";
import { refresh, useBudgets, useResource, useSessionCalls } from "./store.js";
import type { WalletResp } from "./types.js";

interface Issued {
  accountId?: string;
  privateKey?: string;
  fundedHbar?: number;
  error?: string;
}

function hashscanBase(network?: string): string {
  return network?.includes("mainnet") ? "https://hashscan.io/mainnet" : "https://hashscan.io/testnet";
}

export default function WalletMenu() {
  const { data: wallet, loading } = useResource<WalletResp>("wallet");
  const [calls] = useSessionCalls();
  const [budgets] = useBudgets();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [issuing, setIssuing] = useState(false);
  const [issued, setIssued] = useState<Issued | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);

  const connected = !!wallet?.ok && !!wallet.accountId;
  const paid = calls.filter((c) => c.status === "ok");
  const spent = paid.reduce((s, c) => s + (c.hbar ?? 0), 0);
  const explorer = hashscanBase(wallet?.network);

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
      const data = (await res.json()) as Issued;
      setIssued(data);
      if (data.privateKey) {
        await copy(
          "issued",
          `AGENT_ACCOUNT_ID=${data.accountId}\nAGENT_PRIVATE_KEY=${data.privateKey}`,
        );
      }
    } catch (err) {
      setIssued({ error: String(err) });
    } finally {
      setIssuing(false);
    }
  };

  return (
    <div ref={rootRef} style={{ position: "relative", flexShrink: 0 }}>
      <button
        onClick={() => setOpen((v) => !v)}
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
        <span
          style={{
            width: 7,
            height: 7,
            borderRadius: "50%",
            background: connected ? C.green : "#FFFFFF",
            flexShrink: 0,
          }}
        />
        {connected ? (
          <>
            <span style={{ opacity: 0.55, fontSize: 11 }}>
              {shortId(wallet?.accountId ?? "")}
            </span>
            <span>
              {wallet?.balanceHbar != null ? `${wallet.balanceHbar.toFixed(4)} ℏ` : "—"}
            </span>
          </>
        ) : (
          <span>{loading ? "Checking wallet…" : "Connect wallet"}</span>
        )}
        <span style={{ fontSize: 9, opacity: 0.6 }}>{open ? "▲" : "▼"}</span>
      </button>

      {open && (
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
          {connected ? (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
                <span style={{ fontSize: 15, fontFamily: FF_HEAD, color: C.white }}>
                  {wallet?.accountId}
                </span>
                <Badge tone="pass">{wallet?.network?.replace("hedera:", "") ?? "testnet"}</Badge>
              </div>
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
                {wallet?.balanceHbar != null ? fmtHbar(wallet.balanceHbar) : "—"}
              </div>
              <div style={{ fontSize: 12, color: C.faint, fontFamily: FF_MONO }}>
                {wallet?.tokens?.length ?? 0} HTS token{(wallet?.tokens?.length ?? 0) === 1 ? "" : "s"}
              </div>

              <div style={{ height: 1, background: C.border, margin: "16px 0" }} />

              <Row label="Session spend" value={fmtHbar(spent)} />
              <Row label="Calls settled" value={String(paid.length)} />
              <Row
                label="Per-call cap"
                value={budgets.perCallEnabled ? fmtHbar(budgets.perCallHbar) : "off"}
              />
              <Row
                label="Session cap"
                value={budgets.dailyEnabled ? fmtHbar(budgets.dailyHbar) : "off"}
              />

              <div style={{ height: 1, background: C.border, margin: "16px 0" }} />

              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                <Action onClick={() => copy("account", wallet?.accountId ?? "")}>
                  {copied === "account" ? "copied" : "Copy ID"}
                </Action>
                <Action onClick={() => refresh("wallet")}>Refresh</Action>
                <Action href={`${explorer}/account/${wallet?.accountId}`}>HashScan ↗</Action>
                <Action href="/dashboard/wallet">Wallet</Action>
                <Action href="/dashboard/budgets">Budgets</Action>
              </div>
            </>
          ) : (
            <>
              <div style={{ fontSize: 16, fontFamily: FF_HEAD, color: C.white, marginBottom: 8 }}>
                No agent wallet configured
              </div>
              <p style={{ margin: "0 0 14px", fontSize: 13, lineHeight: 1.6, color: C.muted }}>
                {wallet?.error ??
                  "This dashboard signs payments with a server-side Hedera key. Issue a funded testnet account, then set it in the web app's .env and restart."}
              </p>

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
                      ? "Credentials copied — paste them into .env and restart. They are shown nowhere and cannot be re-issued."
                      : "Copy the credentials into .env and restart."}
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

              <div style={{ marginTop: 14 }}>
                <Action href="/dashboard/connect">Full setup guide</Action>
              </div>
            </>
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
