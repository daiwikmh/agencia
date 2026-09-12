import type { ReactNode } from "react";
import { GlobalStyle } from "./GlobalStyle.js";
import { C, FF_HEAD, FF_MONO } from "./theme.js";
import { Dot } from "./ui.js";
import { fmtHbar } from "./format.js";
import { SECTIONS, type Tab } from "./types.js";
import type { AuditResp, HealthResp, ManifestResp, WalletResp } from "./types.js";
import { refreshAll, useResource, useSessionCalls } from "./store.js";

export default function Shell({ active, children }: { active: Tab; children: ReactNode }) {
  const { data: health } = useResource<HealthResp>("health");
  const { data: manifestResp } = useResource<ManifestResp>("manifest");
  const { data: audit } = useResource<AuditResp>("audit");
  const { data: wallet } = useResource<WalletResp>("wallet");
  const [calls] = useSessionCalls();

  const manifest = manifestResp?.manifest ?? null;
  const reachable = health?.reachable ?? false;
  const sessionSpent = calls
    .filter((c) => c.status === "ok")
    .reduce((s, c) => s + (c.hbar ?? 0), 0);

  return (
    <div
      style={{
        display: "flex",
        minHeight: "100vh",
        background: C.bg,
        color: C.ink,
        fontFamily: "'Inter',sans-serif",
      }}
    >
      <GlobalStyle />

      <aside
        style={{
          width: 232,
          flexShrink: 0,
          background: C.navy,
          borderRight: `1px solid ${C.border}`,
          display: "flex",
          flexDirection: "column",
          height: "100vh",
          position: "sticky",
          top: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 9, padding: "18px 18px 12px" }}>
          <span style={{ fontSize: 14, color: C.accent }}>◆</span>
          <span
            style={{
              fontSize: 15,
              fontWeight: 700,
              color: C.white,
              fontFamily: FF_HEAD,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
            }}
          >
            Agencia
          </span>
        </div>

        <div style={{ margin: "0 18px 14px", display: "flex", flexDirection: "column", gap: 7 }}>
          <StatusLine
            tone={reachable ? "good" : "bad"}
            text={reachable ? "Service reachable" : "Service down"}
          />
          <StatusLine
            tone={audit?.topicId ? "good" : "warn"}
            text={audit?.topicId ? "HCS audit live" : "No HCS topic"}
          />
        </div>

        <nav style={{ flex: 1, overflowY: "auto", paddingTop: 6, borderTop: `1px solid ${C.border}` }}>
          <div
            style={{
              fontSize: 9,
              color: C.faint,
              letterSpacing: "0.16em",
              fontFamily: FF_MONO,
              padding: "10px 18px 4px",
            }}
          >
            SECTIONS
          </div>
          {SECTIONS.map((s) => (
            <a
              key={s.id}
              href={`/dashboard/${s.id}`}
              className={`ag-nav-row ${active === s.id ? "active" : ""}`}
              style={{ textDecoration: "none" }}
            >
              <span
                style={{ width: 16, textAlign: "center", flexShrink: 0, color: C.faint, fontSize: 12 }}
              >
                {s.icon}
              </span>
              <span style={{ flex: 1 }}>{s.label}</span>
            </a>
          ))}
        </nav>

        <a
          href="/dashboard/wallet"
          style={{
            margin: "10px 14px",
            padding: "10px 12px",
            border: `1px solid ${C.border}`,
            borderRadius: 12,
            background: C.card,
            textDecoration: "none",
            display: "block",
          }}
        >
          <div style={{ fontSize: 8.5, color: C.faint, fontFamily: FF_MONO, letterSpacing: "0.16em" }}>
            BALANCE
          </div>
          <div style={{ fontSize: 16, fontWeight: 700, color: C.white, fontFamily: FF_HEAD }}>
            {wallet?.ok && wallet.balanceHbar != null ? fmtHbar(wallet.balanceHbar) : "—"}
          </div>
        </a>

        <div style={{ padding: "12px 18px", borderTop: `1px solid ${C.border}` }}>
          <a className="ag-link" href="/" style={{ fontSize: 11, fontFamily: FF_MONO }}>
            ← Landing page
          </a>
        </div>
      </aside>

      <div
        style={{
          flex: 1,
          minWidth: 0,
          display: "flex",
          flexDirection: "column",
          height: "100vh",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            height: 52,
            flexShrink: 0,
            borderBottom: `1px solid ${C.border}`,
            background: C.bg,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 24px",
          }}
        >
          <div style={{ fontSize: 16, fontWeight: 700, color: C.white, fontFamily: FF_HEAD }}>
            {SECTIONS.find((s) => s.id === active)?.label ?? "Dashboard"}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <span style={{ fontSize: 11, color: C.muted, fontFamily: FF_MONO }}>
              {calls.length} call{calls.length === 1 ? "" : "s"} · {fmtHbar(sessionSpent)} spent
            </span>
            <button
              className="ag-btn"
              style={{ background: C.card, color: C.muted, border: `1px solid ${C.border}` }}
              onClick={() => refreshAll()}
            >
              ↻ Refresh
            </button>
          </div>
        </div>

        <div style={{ flex: 1, overflowY: "auto" }}>
          <main
            style={{
              padding: "22px 26px",
              maxWidth: 1180,
              margin: "0 auto",
              width: "100%",
              display: "flex",
              flexDirection: "column",
              gap: 26,
            }}
          >
            {children}
          </main>

          <footer
            style={{
              borderTop: `1px solid ${C.border}`,
              padding: "11px 26px",
              display: "flex",
              justifyContent: "space-between",
              background: C.card,
            }}
          >
            <span style={{ fontSize: 10, color: C.faint, fontFamily: FF_MONO }}>
              AGENCIA · x402 on Hedera · Blocky402
            </span>
            <span style={{ fontSize: 10, color: C.faint, fontFamily: FF_MONO }}>
              {manifest ? `${manifest.resources.length} priced tool(s)` : "—"}
            </span>
          </footer>
        </div>
      </div>
    </div>
  );
}

function StatusLine({ tone, text }: { tone: "good" | "warn" | "bad"; text: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
      <Dot tone={tone} />
      <span style={{ fontSize: 10.5, color: C.muted, fontFamily: FF_MONO }}>{text}</span>
    </div>
  );
}
