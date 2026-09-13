import { useMemo } from "react";
import { Badge, Card, Empty, SectionTitle, StatTile } from "../ui.js";
import { C, FF_HEAD, FF_MONO } from "../theme.js";
import { fmtHbar, shortId, timeAgo } from "../format.js";
import { useResource, useSessionCalls } from "../store.js";
import {
  CATEGORY_COLOR,
  CATEGORY_COLOR_FALLBACK,
  type AuditResp,
  type ManifestResp,
} from "../types.js";

const DAY = 86_400_000;
const WINDOW_DAYS = 14;

interface Event {
  hbar: number;
  at: number;
  payer: string;
  tool: string;
}

interface Group {
  key: string;
  calls: number;
  hbar: number;
}

function groupBy(events: Event[], pick: (e: Event) => string): Group[] {
  const map = new Map<string, Group>();
  for (const e of events) {
    const key = pick(e);
    const g = map.get(key) ?? { key, calls: 0, hbar: 0 };
    g.calls += 1;
    g.hbar += e.hbar;
    map.set(key, g);
  }
  return [...map.values()].sort((a, b) => b.hbar - a.hbar);
}

export default function Usage() {
  const { data: audit } = useResource<AuditResp>("audit");
  const { data: manifestResp } = useResource<ManifestResp>("manifest");
  const [calls] = useSessionCalls();

  const toolCategory = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of manifestResp?.manifest?.resources ?? []) {
      map.set(r.tool, r.category ?? "Other");
    }
    return map;
  }, [manifestResp]);

  const events = useMemo<Event[]>(() => {
    return (audit?.messages ?? [])
      .map((m) => (m.payload ?? {}) as Record<string, unknown>)
      .filter((p) => p.amount != null && p.settledAt != null)
      .map((p) => ({
        hbar: Number(p.amount) / 1e8,
        at: new Date(String(p.settledAt)).getTime(),
        payer: p.payer ? String(p.payer) : "unknown",
        tool: p.tool ? String(p.tool) : "unknown",
      }))
      .filter((e) => Number.isFinite(e.hbar) && Number.isFinite(e.at));
  }, [audit]);

  const now = Date.now();
  const totalHbar = events.reduce((s, e) => s + e.hbar, 0);
  const last24h = events.filter((e) => now - e.at < DAY).reduce((s, e) => s + e.hbar, 0);
  const uniquePayers = new Set(events.map((e) => e.payer)).size;
  const avg = events.length ? totalHbar / events.length : 0;

  const finishedCalls = calls.filter((c) => c.status !== "running");
  const successRate = finishedCalls.length
    ? (finishedCalls.filter((c) => c.status === "ok").length / finishedCalls.length) * 100
    : null;

  const buckets = useMemo(() => {
    const first = new Date(now - (WINDOW_DAYS - 1) * DAY);
    first.setHours(0, 0, 0, 0);
    const base = first.getTime();
    const list = Array.from({ length: WINDOW_DAYS }, (_, i) => ({ start: base + i * DAY, hbar: 0 }));
    for (const e of events) {
      const idx = Math.floor((e.at - base) / DAY);
      if (idx >= 0 && idx < WINDOW_DAYS) list[idx].hbar += e.hbar;
    }
    return list;
  }, [events, now]);

  const maxBucket = Math.max(...buckets.map((b) => b.hbar), Number.EPSILON);
  const byTool = groupBy(events, (e) => e.tool);
  const byCategory = groupBy(events, (e) => toolCategory.get(e.tool) ?? "Other");
  const byPayer = groupBy(events, (e) => e.payer).slice(0, 6);

  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div>
        <SectionTitle>Settled on-chain</SectionTitle>
        {events.length ? (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))",
              gap: 12,
            }}
          >
            <StatTile label="Total revenue" value={fmtHbar(totalHbar)} tone="good" />
            <StatTile label="Settled calls" value={events.length} />
            <StatTile label="Unique payers" value={uniquePayers} />
            <StatTile label="Avg / call" value={fmtHbar(avg)} />
            <StatTile label="Last 24h" value={fmtHbar(last24h)} tone={last24h > 0 ? "good" : "default"} />
            <StatTile
              label="Session success"
              value={successRate != null ? `${successRate.toFixed(0)}%` : "—"}
              tone={successRate == null ? "default" : successRate >= 90 ? "good" : successRate >= 60 ? "warn" : "bad"}
              sub={`${finishedCalls.length} finished`}
            />
          </div>
        ) : (
          <Card>
            <Empty
              text={
                audit?.topicId
                  ? "No settled payments yet — call a service from the Catalog."
                  : (audit?.error ?? "No HCS topic configured on the service.")
              }
            />
          </Card>
        )}
      </div>

      {events.length > 0 && (
        <>
          <div>
            <SectionTitle>Revenue · last {WINDOW_DAYS} days</SectionTitle>
            <Card>
              <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 140 }}>
                {buckets.map((b) => (
                  <div
                    key={b.start}
                    title={`${new Date(b.start).toLocaleDateString()} — ${fmtHbar(b.hbar)}`}
                    style={{
                      flex: 1,
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "flex-end",
                      alignItems: "center",
                      height: "100%",
                    }}
                  >
                    <div
                      style={{
                        width: 24,
                        maxWidth: "70%",
                        height: `${Math.max((b.hbar / maxBucket) * 100, b.hbar > 0 ? 4 : 0)}%`,
                        background: b.hbar > 0 ? C.accent : C.navyLight,
                        borderRadius: 999,
                        minHeight: b.hbar > 0 ? 8 : 8,
                      }}
                    />
                  </div>
                ))}
              </div>
            </Card>
          </div>

          <div>
            <SectionTitle>Revenue by category</SectionTitle>
            <Card pad={0}>
              {byCategory.map((g) => {
                const color = CATEGORY_COLOR[g.key] ?? CATEGORY_COLOR_FALLBACK;
                const pct = totalHbar > 0 ? (g.hbar / totalHbar) * 100 : 0;
                return (
                  <div key={g.key} style={{ padding: "11px 16px", borderBottom: `1px solid ${C.border}` }}>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        marginBottom: 6,
                        gap: 10,
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                        <span
                          style={{ width: 10, height: 10, borderRadius: 3, background: color, flexShrink: 0 }}
                        />
                        <span style={{ fontSize: 12.5, color: C.ink, fontFamily: FF_MONO }}>{g.key}</span>
                        <span style={{ fontSize: 10.5, color: C.faint, fontFamily: FF_MONO }}>
                          {g.calls} call{g.calls === 1 ? "" : "s"} · {pct.toFixed(0)}%
                        </span>
                      </div>
                      <span style={{ fontSize: 12.5, color: C.green, fontFamily: FF_HEAD, fontWeight: 700 }}>
                        {fmtHbar(g.hbar)}
                      </span>
                    </div>
                    <div style={{ height: 6, background: C.navy, borderRadius: 4, overflow: "hidden" }}>
                      <div
                        style={{ height: "100%", width: `${Math.max(pct, 2)}%`, background: color, borderRadius: 4 }}
                      />
                    </div>
                  </div>
                );
              })}
            </Card>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))",
              gap: 16,
            }}
          >
            <div>
              <SectionTitle>By tool</SectionTitle>
              <Card pad={0}>
                {byTool.map((g) => {
                  const color = CATEGORY_COLOR[toolCategory.get(g.key) ?? ""] ?? CATEGORY_COLOR_FALLBACK;
                  const pct = totalHbar > 0 ? (g.hbar / totalHbar) * 100 : 0;
                  return (
                    <div
                      key={g.key}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        padding: "11px 16px",
                        borderBottom: `1px solid ${C.border}`,
                      }}
                    >
                      <div style={{ minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                          <span style={{ width: 7, height: 7, borderRadius: "50%", background: color, flexShrink: 0 }} />
                          <span style={{ fontSize: 12.5, color: C.ink, fontFamily: FF_MONO }}>{g.key}</span>
                        </div>
                        <div style={{ fontSize: 10.5, color: C.faint, fontFamily: FF_MONO, marginTop: 2, marginLeft: 14 }}>
                          {g.calls} call{g.calls === 1 ? "" : "s"} · {pct.toFixed(0)}%
                        </div>
                      </div>
                      <span style={{ fontSize: 12.5, color: C.green, fontFamily: FF_HEAD, fontWeight: 700 }}>
                        {fmtHbar(g.hbar)}
                      </span>
                    </div>
                  );
                })}
              </Card>
            </div>

            <div>
              <SectionTitle>Top payers</SectionTitle>
              <Card pad={0}>
                {byPayer.length ? (
                  byPayer.map((g) => {
                    const pct = totalHbar > 0 ? (g.hbar / totalHbar) * 100 : 0;
                    return (
                      <div
                        key={g.key}
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          padding: "11px 16px",
                          borderBottom: `1px solid ${C.border}`,
                        }}
                      >
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 12.5, color: C.ink, fontFamily: FF_MONO }}>
                            {shortId(g.key)}
                          </div>
                          <div style={{ fontSize: 10.5, color: C.faint, fontFamily: FF_MONO, marginTop: 2 }}>
                            {g.calls} call{g.calls === 1 ? "" : "s"} · {pct.toFixed(0)}%
                          </div>
                        </div>
                        <span style={{ fontSize: 12.5, color: C.green, fontFamily: FF_HEAD, fontWeight: 700 }}>
                          {fmtHbar(g.hbar)}
                        </span>
                      </div>
                    );
                  })
                ) : (
                  <div style={{ padding: 16 }}>
                    <Empty text="No payers yet." />
                  </div>
                )}
              </Card>
            </div>
          </div>
        </>
      )}

      <div>
        <SectionTitle>Session activity</SectionTitle>
        <Card pad={0}>
          {calls.length ? (
            calls.map((c) => (
              <div
                key={c.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 14,
                  padding: "11px 16px",
                  borderBottom: `1px solid ${C.border}`,
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, color: C.ink, fontFamily: FF_MONO }}>
                    <span style={{ color: C.accent }}>{c.tool}</span>{" "}
                    <span
                      style={{
                        color: C.muted,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {c.summary}
                    </span>
                  </div>
                  <div style={{ fontSize: 10.5, color: C.faint, fontFamily: FF_MONO, marginTop: 2 }}>
                    {timeAgo(c.at)}
                    {c.txId ? ` · ${shortId(c.txId)}` : ""}
                  </div>
                </div>
                <div style={{ flexShrink: 0 }}>
                  {c.status === "running" && <Badge tone="neutral">running</Badge>}
                  {c.status === "ok" && <Badge tone="pass">{c.hbar ? fmtHbar(c.hbar) : "paid"}</Badge>}
                  {c.status === "error" && <Badge tone="breach">failed</Badge>}
                </div>
              </div>
            ))
          ) : (
            <div style={{ padding: 16 }}>
              <Empty text="No calls fired this session." />
            </div>
          )}
        </Card>
      </div>
    </section>
  );
}
