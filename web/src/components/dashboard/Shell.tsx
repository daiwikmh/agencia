import { useMemo, useState, type ReactNode } from "react";
import { GlobalStyle } from "./GlobalStyle.js";
import { C, FF_BODY, FF_HEAD, FF_MONO } from "./theme.js";
import { Badge, Card, Empty, Fact, FactRow } from "./ui.js";
import { fmtHbar, shortId, timeAgo } from "./format.js";
import { SECTIONS, CATEGORY_COLOR, CATEGORY_COLOR_FALLBACK, type Tab } from "./types.js";
import type { AuditResp, HealthResp, ManifestResp, SessionCall, WalletResp } from "./types.js";
import { refreshAll, useResource, useSessionCalls } from "./store.js";

const DAY = 86_400_000;
const DAY_LETTER = ["S", "M", "T", "W", "T", "F", "S"];
const STEM = 118;

type Mode = "revenue" | "calls";

export default function Shell({ active, children }: { active: Tab; children: ReactNode }) {
  const { data: health } = useResource<HealthResp>("health");
  const { data: manifestResp } = useResource<ManifestResp>("manifest");
  const { data: audit } = useResource<AuditResp>("audit");
  const { data: wallet } = useResource<WalletResp>("wallet");
  const [calls] = useSessionCalls();
  const [mode, setMode] = useState<Mode>("revenue");

  const manifest = manifestResp?.manifest ?? null;
  const reachable = health?.reachable ?? false;
  const network = manifest?.network ?? health?.health?.network ?? "—";
  const facilitator = manifest?.facilitator ?? health?.health?.facilitator ?? "—";
  const section = SECTIONS.find((s) => s.id === active);
  const sessionSpent = calls
    .filter((c) => c.status === "ok")
    .reduce((s, c) => s + (c.hbar ?? 0), 0);

  const toolCategory = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of manifest?.resources ?? []) map.set(r.tool, r.category ?? "Other");
    return map;
  }, [manifest]);

  const events = useMemo(
    () =>
      (audit?.messages ?? [])
        .map((m) => (m.payload ?? {}) as Record<string, unknown>)
        .filter((p) => p.amount != null && p.settledAt != null)
        .map((p) => ({
          hbar: Number(p.amount) / 1e8,
          at: new Date(String(p.settledAt)).getTime(),
        }))
        .filter((e) => Number.isFinite(e.hbar) && Number.isFinite(e.at)),
    [audit],
  );

  const { buckets, base } = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const start = today.getTime() - 6 * DAY;
    const list = Array.from({ length: 7 }, (_, i) => ({ start: start + i * DAY, hbar: 0, calls: 0 }));
    for (const e of events) {
      const idx = Math.floor((e.at - start) / DAY);
      if (idx >= 0 && idx < 7) {
        list[idx].hbar += e.hbar;
        list[idx].calls += 1;
      }
    }
    return { buckets: list, base: start };
  }, [events]);

  const values = buckets.map((b) => (mode === "revenue" ? b.hbar : b.calls));
  const total = values.reduce((s, v) => s + v, 0);
  const prev = events
    .filter((e) => e.at >= base - 7 * DAY && e.at < base)
    .reduce((s, e) => s + (mode === "revenue" ? e.hbar : 1), 0);
  const delta = prev > 0 ? ((total - prev) / prev) * 100 : null;
  const label = (v: number) => (mode === "revenue" ? fmtHbar(v) : `${v} call${v === 1 ? "" : "s"}`);

  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.ink, fontFamily: FF_BODY }}>
      <GlobalStyle />

      <div
        style={{
          maxWidth: 1460,
          margin: "0 auto",
          padding: "22px 28px 30px",
          display: "flex",
          flexDirection: "column",
          gap: 22,
        }}
      >
        <header className="ag-head">
          <a
            href="/"
            style={{ display: "flex", alignItems: "center", gap: 11, textDecoration: "none", flexShrink: 0 }}
          >
            <img src="/logo.png" alt="" style={{ height: 26, width: "auto", display: "block" }} />
            <span
              style={{
                fontSize: 16.5,
                fontWeight: 700,
                color: C.white,
                fontFamily: FF_HEAD,
                letterSpacing: "0.03em",
              }}
            >
              AGENCIA
            </span>
          </a>

          <nav className="ag-scroll-x ag-nav">
            {SECTIONS.filter((s) => s.id !== "playground").map((s) => (
              <a
                key={s.id}
                href={`/dashboard/${s.id}`}
                className={`ag-tab ${active === s.id ? "active" : ""}`}
              >
                {s.label}
              </a>
            ))}
          </nav>

          <form
            action="/dashboard/catalog"
            method="get"
            style={{ position: "relative", flex: "1 1 200px", maxWidth: 300, minWidth: 170 }}
          >
            <input
              name="q"
              className="ag-search"
              placeholder="Enter your search request..."
              defaultValue={initialQuery()}
            />
            <button
              type="submit"
              className="ag-row"
              aria-label="Search catalog"
              style={{
                position: "absolute",
                right: 18,
                top: "50%",
                transform: "translateY(-50%)",
                width: "auto",
                color: C.muted,
                display: "inline-flex",
              }}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.4" />
                <path d="M11 11L14.5 14.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              </svg>
            </button>
          </form>

          <button className="ag-icon-btn" onClick={() => refreshAll()} title="Refresh all data">
            ↻
          </button>
          <a
            className="ag-icon-btn"
            href="/dashboard/playground"
            title="Playground"
            aria-label="Playground"
            style={
              active === "playground"
                ? { background: C.white, color: "#FFFFFF", borderColor: C.white }
                : undefined
            }
          >
            ▷
          </a>
          <a
            href="/dashboard/wallet"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 9,
              background: C.white,
              color: "#FFFFFF",
              borderRadius: 999,
              padding: "10px 18px",
              textDecoration: "none",
              fontSize: 13,
              fontFamily: FF_HEAD,
              flexShrink: 0,
            }}
          >
            <span style={{ opacity: 0.55, fontSize: 11 }}>balance</span>
            {wallet?.ok && wallet.balanceHbar != null ? fmtHbar(wallet.balanceHbar) : "—"}
          </a>
        </header>

        <div className="ag-bento">
          <Card
            pad="30px 32px 26px"
            style={{ display: "flex", flexDirection: "column", justifyContent: "center" }}
          >
            <div className="ag-hero">
              <div style={{ minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 10 }}>
                  <span
                    style={{
                      width: 46,
                      height: 46,
                      borderRadius: 15,
                      background: C.navy,
                      color: C.white,
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 17,
                      flexShrink: 0,
                    }}
                  >
                    {section?.icon ?? "◆"}
                  </span>
                  <h1
                    style={{
                      margin: 0,
                      fontSize: 40,
                      fontWeight: 500,
                      letterSpacing: "-0.045em",
                      color: C.white,
                      fontFamily: FF_HEAD,
                      lineHeight: 1,
                    }}
                  >
                    {section?.label ?? "Dashboard"}
                  </h1>
                </div>
                <p
                  style={{
                    margin: "0 0 26px",
                    fontSize: 14,
                    lineHeight: 1.55,
                    color: C.muted,
                    maxWidth: 420,
                  }}
                >
                  {section?.blurb}
                </p>

                <div
                  style={{
                    fontSize: 56,
                    fontWeight: 500,
                    letterSpacing: "-0.05em",
                    color: C.white,
                    fontFamily: FF_HEAD,
                    lineHeight: 1,
                  }}
                >
                  {delta != null ? `${delta >= 0 ? "+" : ""}${delta.toFixed(0)}%` : label(total)}
                </div>
                <div
                  style={{
                    fontSize: 13.5,
                    lineHeight: 1.5,
                    color: C.muted,
                    marginTop: 10,
                    maxWidth: 260,
                  }}
                >
                  {delta != null
                    ? `This week's ${mode} is ${delta >= 0 ? "higher" : "lower"} than last week's`
                    : total > 0
                      ? `Settled through HCS over the last 7 days`
                      : "Nothing settled in the last 7 days"}
                </div>

                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 22 }}>
                  <Chip>{network}</Chip>
                  <Chip>{facilitator}</Chip>
                  <Chip tone={reachable ? "good" : "bad"}>{reachable ? "Service online" : "Service offline"}</Chip>
                  <Chip tone={audit?.topicId ? "good" : "warn"}>
                    {audit?.topicId ? `HCS ${audit.topicId}` : "No HCS topic"}
                  </Chip>
                </div>
              </div>

              <div>
                <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 4 }}>
                  <select
                    className="ag-pill-select"
                    value={mode}
                    onChange={(e) => setMode(e.target.value as Mode)}
                    style={{ border: `1px solid ${C.border}` }}
                  >
                    <option value="revenue">Revenue</option>
                    <option value="calls">Calls</option>
                  </select>
                </div>
                <Lollipop buckets={buckets} values={values} label={label} />
              </div>
            </div>
          </Card>

          <div style={{ display: "flex", flexDirection: "column", gap: 20, justifyContent: "space-between" }}>
            <Card pad="24px 26px">
              <div
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  justifyContent: "space-between",
                  gap: 16,
                  marginBottom: 18,
                }}
              >
                <span
                  style={{
                    fontSize: 21,
                    fontWeight: 500,
                    letterSpacing: "-0.03em",
                    color: C.white,
                    fontFamily: FF_HEAD,
                  }}
                >
                  Your recent calls
                </span>
                <a className="ag-seeall" href="/dashboard/usage">
                  See all activity
                </a>
              </div>
              {calls.length === 0 ? (
                <Empty text="No calls fired this session yet." />
              ) : (
                calls.slice(0, 3).map((c, i) => (
                  <CallRow
                    key={c.id}
                    call={c}
                    first={i === 0}
                    color={CATEGORY_COLOR[toolCategory.get(c.tool) ?? ""] ?? CATEGORY_COLOR_FALLBACK}
                  />
                ))
              )}
            </Card>

            <Card pad="24px 26px">
              <div
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  justifyContent: "space-between",
                  gap: 16,
                  marginBottom: 20,
                }}
              >
                <span
                  style={{
                    fontSize: 21,
                    fontWeight: 500,
                    letterSpacing: "-0.03em",
                    color: C.white,
                    fontFamily: FF_HEAD,
                  }}
                >
                  Session progress
                </span>
                <span style={{ fontSize: 12.5, color: C.muted, fontFamily: FF_MONO }}>
                  {manifest ? `${manifest.resources.length} priced tools` : "—"}
                </span>
              </div>
              <FactRow>
                <Fact label="Calls fired" value={calls.length} />
                <Fact label="Settled" value={calls.filter((c) => c.status === "ok").length} />
                <Fact label="Spent" value={fmtHbar(sessionSpent)} />
              </FactRow>
              <Ticks calls={calls} />
            </Card>
          </div>
        </div>

        <main style={{ display: "flex", flexDirection: "column", gap: 26 }}>{children}</main>

        <footer
          style={{
            display: "flex",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 10,
            padding: "4px 6px",
          }}
        >
          <span style={{ fontSize: 11.5, color: C.faint, fontFamily: FF_MONO }}>
            AGENCIA · x402 on Hedera · Blocky402
          </span>
          <a className="ag-link" href="/" style={{ fontSize: 11.5, fontFamily: FF_MONO }}>
            ← Landing page
          </a>
        </footer>
      </div>
    </div>
  );
}

function initialQuery() {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get("q") ?? "";
}

function Chip({ children, tone = "default" }: { children: ReactNode; tone?: "default" | "good" | "warn" | "bad" }) {
  const fg = tone === "good" ? C.green : tone === "warn" ? C.amber : tone === "bad" ? C.red : C.ink;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        background: C.navy,
        color: fg,
        borderRadius: 999,
        padding: "8px 16px",
        fontSize: 12.5,
        fontFamily: FF_MONO,
        maxWidth: 230,
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}

function Lollipop({
  buckets,
  values,
  label,
}: {
  buckets: { start: number }[];
  values: number[];
  label: (v: number) => string;
}) {
  const max = Math.max(...values, Number.EPSILON);
  const peak = values.some((v) => v > 0) ? values.indexOf(Math.max(...values)) : -1;

  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 6, paddingTop: 44 }}>
      {buckets.map((b, i) => {
        const v = values[i];
        const h = v > 0 ? Math.max((v / max) * STEM, 14) : 8;
        const hot = i === peak;
        return (
          <div
            key={b.start}
            title={`${new Date(b.start).toLocaleDateString()} — ${label(v)}`}
            style={{
              flex: 1,
              minWidth: 0,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              borderRadius: 999,
              paddingBottom: 8,
              background: hot
                ? `linear-gradient(180deg, ${C.navy} 0%, rgba(242,242,244,0) 92%)`
                : "transparent",
            }}
          >
            <div
              style={{
                height: STEM,
                display: "flex",
                flexDirection: "column",
                justifyContent: "flex-end",
                alignItems: "center",
                position: "relative",
                width: "100%",
              }}
            >
              {hot && (
                <span
                  style={{
                    position: "absolute",
                    bottom: h + 16,
                    background: C.white,
                    color: "#FFFFFF",
                    borderRadius: 999,
                    padding: "6px 13px",
                    fontSize: 12.5,
                    fontFamily: FF_HEAD,
                    whiteSpace: "nowrap",
                  }}
                >
                  {label(v)}
                </span>
              )}
              <div style={{ position: "relative", width: 2, height: h, background: C.border, borderRadius: 2 }}>
                <span
                  style={{
                    position: "absolute",
                    top: -5,
                    left: "50%",
                    transform: "translateX(-50%)",
                    width: 11,
                    height: 11,
                    borderRadius: "50%",
                    background: v > 0 ? C.cyan : C.border,
                  }}
                />
              </div>
            </div>
            <span
              style={{
                marginTop: 14,
                width: 38,
                height: 38,
                borderRadius: "50%",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                background: hot ? C.white : C.navyLight,
                color: hot ? "#FFFFFF" : C.muted,
                fontSize: 13,
                fontFamily: FF_HEAD,
              }}
            >
              {DAY_LETTER[new Date(b.start).getDay()]}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function CallRow({ call, first, color }: { call: SessionCall; first: boolean; color: string }) {
  const [open, setOpen] = useState(first);

  return (
    <div style={{ borderTop: first ? "none" : `1px solid ${C.border}`, padding: "14px 0" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 13 }}>
        <span
          style={{
            width: 46,
            height: 46,
            borderRadius: 15,
            background: `${color}1F`,
            color,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 17,
            flexShrink: 0,
          }}
        >
          ◈
        </span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
            <span
              style={{
                fontSize: 14.5,
                fontWeight: 500,
                color: C.white,
                fontFamily: FF_HEAD,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {call.tool}
            </span>
            <span style={{ color: C.border }}>|</span>
            {call.status === "ok" && <Badge tone="pass">Paid</Badge>}
            {call.status === "error" && <Badge tone="breach">Failed</Badge>}
            {call.status === "running" && <Badge tone="neutral">Running</Badge>}
          </div>
          <div style={{ fontSize: 13, color: C.muted, fontFamily: FF_MONO, marginTop: 3 }}>
            {call.hbar != null ? fmtHbar(call.hbar) : "—"}
          </div>
        </div>
        <button
          className="ag-icon-btn"
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? "Collapse" : "Expand"}
          style={{ border: "none", background: C.navyLight, fontSize: 11 }}
        >
          {open ? "▲" : "▼"}
        </button>
      </div>

      {open && (
        <div style={{ animation: "ag-fade .2s ease", marginTop: 12 }}>
          <div style={{ fontSize: 13.5, lineHeight: 1.55, color: C.muted }}>{call.summary}</div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              marginTop: 10,
              fontSize: 12.5,
              color: C.faint,
              fontFamily: FF_MONO,
            }}
          >
            <span>{timeAgo(call.at)}</span>
            {call.txId && (
              <>
                <span style={{ color: C.border }}>|</span>
                <span>{shortId(call.txId)}</span>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Ticks({ calls }: { calls: SessionCall[] }) {
  const recent = calls.slice(0, 44).reverse();
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 3, marginTop: 22, height: 34 }}>
      {Array.from({ length: 44 }, (_, i) => {
        const c = recent[i - (44 - recent.length)];
        const tone =
          c?.status === "ok"
            ? C.white
            : c?.status === "error"
              ? C.accent
              : c?.status === "running"
                ? C.cyan
                : C.border;
        return (
          <span
            key={i}
            style={{
              flex: 1,
              height: c ? 34 : 22,
              background: tone,
              borderRadius: 1,
              minWidth: 1,
            }}
          />
        );
      })}
    </div>
  );
}
