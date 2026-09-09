import { useMemo } from "react";
import { Card, Empty, SectionTitle, StatTile } from "../ui.js";
import { C, FF_HEAD, FF_MONO } from "../theme.js";
import { fmtHbar, shortId } from "../format.js";
import { useResource } from "../store.js";
import type { AuditResp } from "../types.js";

const DAY = 86_400_000;
const WINDOW_DAYS = 14;

interface Event {
  hbar: number;
  at: number;
  payer: string;
  tool: string;
}

interface Bucket {
  start: number;
  hbar: number;
  calls: number;
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

export default function Analytics() {
  const { data: audit } = useResource<AuditResp>("audit");

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

  const buckets = useMemo<Bucket[]>(() => {
    const first = new Date(now - (WINDOW_DAYS - 1) * DAY);
    first.setHours(0, 0, 0, 0);
    const base = first.getTime();
    const list: Bucket[] = Array.from({ length: WINDOW_DAYS }, (_, i) => ({
      start: base + i * DAY,
      hbar: 0,
      calls: 0,
    }));
    for (const e of events) {
      const idx = Math.floor((e.at - base) / DAY);
      if (idx >= 0 && idx < WINDOW_DAYS) {
        list[idx].hbar += e.hbar;
        list[idx].calls += 1;
      }
    }
    return list;
  }, [events, now]);

  const maxBucket = Math.max(...buckets.map((b) => b.hbar), Number.EPSILON);
  const topPayers = groupBy(events, (e) => e.payer).slice(0, 6);
  const byTool = groupBy(events, (e) => e.tool);

  if (!events.length) {
    return (
      <section>
        <SectionTitle>Analytics</SectionTitle>
        <Card>
          <Empty
            text={
              audit?.topicId
                ? "No settled payments yet — fire a paid request to populate analytics."
                : (audit?.error ?? "No HCS topic configured on the service.")
            }
          />
        </Card>
      </section>
    );
  }

  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div>
        <SectionTitle>Analytics · settled on-chain</SectionTitle>
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
        </div>
      </div>

      <div>
        <SectionTitle>Revenue · last {WINDOW_DAYS} days</SectionTitle>
        <Card>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 132 }}>
            {buckets.map((b) => (
              <div
                key={b.start}
                title={`${new Date(b.start).toLocaleDateString()} — ${fmtHbar(b.hbar)} · ${b.calls} call${b.calls === 1 ? "" : "s"}`}
                style={{
                  flex: 1,
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "flex-end",
                  height: "100%",
                }}
              >
                <div
                  style={{
                    height: `${Math.max((b.hbar / maxBucket) * 100, b.hbar > 0 ? 3 : 0)}%`,
                    background: b.hbar > 0 ? C.accent : C.border,
                    borderRadius: "3px 3px 0 0",
                    minHeight: b.hbar > 0 ? 3 : 1,
                    transition: "height .2s ease",
                  }}
                />
              </div>
            ))}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
            <span style={{ fontSize: 10, color: C.faint, fontFamily: FF_MONO }}>
              {new Date(buckets[0].start).toLocaleDateString()}
            </span>
            <span style={{ fontSize: 10, color: C.faint, fontFamily: FF_MONO }}>today</span>
          </div>
        </Card>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 16 }}>
        <div>
          <SectionTitle>Top payers</SectionTitle>
          <Card pad={0}>
            {topPayers.map((g) => (
              <Row key={g.key} left={shortId(g.key)} calls={g.calls} hbar={g.hbar} total={totalHbar} />
            ))}
          </Card>
        </div>
        <div>
          <SectionTitle>By tool</SectionTitle>
          <Card pad={0}>
            {byTool.map((g) => (
              <Row key={g.key} left={g.key} calls={g.calls} hbar={g.hbar} total={totalHbar} />
            ))}
          </Card>
        </div>
      </div>
    </section>
  );
}

function Row({
  left,
  calls,
  hbar,
  total,
}: {
  left: string;
  calls: number;
  hbar: number;
  total: number;
}) {
  const pct = total > 0 ? (hbar / total) * 100 : 0;
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 14,
        padding: "11px 16px",
        borderBottom: `1px solid ${C.border}`,
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontSize: 12.5,
            color: C.ink,
            fontFamily: FF_MONO,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {left}
        </div>
        <div style={{ fontSize: 10.5, color: C.faint, fontFamily: FF_MONO, marginTop: 2 }}>
          {calls} call{calls === 1 ? "" : "s"} · {pct.toFixed(0)}%
        </div>
      </div>
      <div style={{ fontSize: 12.5, color: C.green, fontFamily: FF_HEAD, fontWeight: 700, flexShrink: 0 }}>
        {fmtHbar(hbar)}
      </div>
    </div>
  );
}
