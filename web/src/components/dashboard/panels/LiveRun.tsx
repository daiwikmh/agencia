import { useEffect, useMemo, useRef, useState } from "react";
import { Badge, Card, Empty, SectionTitle } from "../ui.js";
import { C, FF_HEAD, FF_MONO } from "../theme.js";
import { fmtHbar, shortId } from "../format.js";
import { refresh, useResource, useSessionCalls } from "../store.js";
import type { ManifestResp } from "../types.js";

type Phase =
  | "identity"
  | "discovery"
  | "connect"
  | "route"
  | "challenge"
  | "sign"
  | "settle"
  | "exec"
  | "result"
  | "done"
  | "error";

interface LiveEvent {
  seq: number;
  phase: Phase;
  direction?: "paid" | "received";
  label: string;
  detail?: string;
  hbar?: number;
  transaction?: string;
  hashscan?: string;
  hcs?: { topicId: string; sequenceNumber: string } | null;
  text?: string;
  at: string;
}

const PHASE: Record<Phase, { icon: string; tint: string }> = {
  identity: { icon: "◈", tint: C.cyan },
  discovery: { icon: "⌕", tint: C.cyan },
  connect: { icon: "⇄", tint: C.cyan },
  route: { icon: "▣", tint: "#2f6f5e" },
  challenge: { icon: "402", tint: C.amber },
  sign: { icon: "✎", tint: C.muted },
  settle: { icon: "✓", tint: C.green },
  exec: { icon: "▶", tint: C.white },
  result: { icon: "▤", tint: C.muted },
  done: { icon: "★", tint: C.green },
  error: { icon: "!", tint: C.red },
};

export default function LiveRun() {
  const { data: manifestResp } = useResource<ManifestResp>("manifest");
  const [, updateCalls] = useSessionCalls();
  const [mode, setMode] = useState<"goal" | "lease" | "tool">("goal");
  const [goal, setGoal] = useState(
    "What is HBAR worth right now, and how much HBAR does account 0.0.10500124 hold?",
  );
  const [budget, setBudget] = useState(0.5);
  const [tool, setTool] = useState("infer");
  const [prompt, setPrompt] = useState("Explain x402 settlement on Hedera in two sentences.");
  const [seconds, setSeconds] = useState(30);
  const [ticks, setTicks] = useState(2);
  const [events, setEvents] = useState<LiveEvent[]>([]);
  const [running, setRunning] = useState(false);
  const sourceRef = useRef<EventSource | null>(null);
  const tailRef = useRef<HTMLDivElement | null>(null);

  const resources = manifestResp?.manifest?.resources ?? [];
  const settlements = useMemo(() => events.filter((e) => e.phase === "settle"), [events]);
  const paid = settlements.filter((e) => e.direction !== "received");
  const spent = paid.reduce((s, e) => s + (e.hbar ?? 0), 0);

  useEffect(() => () => sourceRef.current?.close(), []);
  useEffect(() => {
    tailRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [events.length]);

  const start = () => {
    if (running) return;
    setEvents([]);
    setRunning(true);

    const params = new URLSearchParams(
      mode === "goal"
        ? { scenario: "goal", goal, maxTurns: "5", maxHbar: String(budget) }
        : mode === "lease"
          ? { scenario: "lease", seconds: String(seconds), ticks: String(ticks), cpu: "1", memMb: "512" }
          : { scenario: "tool", tool, prompt, max_tokens: "256" },
    );
    const source = new EventSource(`/api/live?${params}`);
    sourceRef.current = source;

    source.onmessage = (message) => {
      const event = JSON.parse(message.data) as LiveEvent;
      setEvents((prev) => [...prev, event]);
      if (event.phase === "settle" && event.direction !== "received" && event.transaction) {
        updateCalls((prev) => [
          {
            id: `${event.transaction}-${event.seq}`,
            tool: mode === "lease" ? "compute_lease" : mode === "goal" ? "agent" : tool,
            summary: event.label,
            at: event.at,
            status: "ok",
            hbar: event.hbar,
            txId: event.transaction,
          },
          ...prev,
        ]);
      }
      if (event.phase === "done" || event.phase === "error") {
        source.close();
        setRunning(false);
        refresh("audit");
        refresh("wallet");
      }
    };
    source.onerror = () => {
      source.close();
      setRunning(false);
    };
  };

  const stop = () => {
    sourceRef.current?.close();
    setRunning(false);
  };

  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <SectionTitle style={{ marginBottom: 0 }}>Agent run, start to settlement</SectionTitle>

      <Card pad="20px 24px">
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12 }}>
          <div style={{ display: "flex", gap: 8 }}>
            {(["goal", "lease", "tool"] as const).map((m) => (
              <button
                key={m}
                className="ag-btn"
                onClick={() => setMode(m)}
                disabled={running}
                style={{
                  background: mode === m ? C.white : C.navy,
                  color: mode === m ? "#FFFFFF" : C.muted,
                }}
              >
                {m === "goal" ? "Give it a goal" : m === "lease" ? "Rent hardware" : "Paid call"}
              </button>
            ))}
          </div>

          {mode === "goal" ? (
            <>
              <input
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                disabled={running}
                placeholder="Tell the agent what you want"
                style={{ flex: 1, minWidth: 260, borderRadius: 999, padding: "10px 18px" }}
              />
              <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 12.5, color: C.muted, fontFamily: FF_MONO }}>cap ℏ</span>
                <input
                  type="number"
                  min={0.05}
                  step={0.05}
                  value={budget}
                  disabled={running}
                  onChange={(e) => setBudget(Math.max(0.05, Number(e.target.value)))}
                  style={{ width: 92, borderRadius: 999, padding: "9px 14px" }}
                />
              </label>
            </>
          ) : mode === "tool" ? (
            <>
              <select
                value={tool}
                onChange={(e) => setTool(e.target.value)}
                disabled={running}
                style={{ borderRadius: 999, padding: "10px 16px", background: C.navy }}
              >
                {resources.map((r) => (
                  <option key={r.resource} value={r.tool}>
                    {r.title ?? r.tool}
                  </option>
                ))}
              </select>
              <input
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                disabled={running}
                placeholder="Prompt"
                style={{ flex: 1, minWidth: 220, borderRadius: 999, padding: "10px 18px" }}
              />
            </>
          ) : (
            <>
              <Field label="seconds" value={seconds} onChange={setSeconds} disabled={running} />
              <Field label="ticks" value={ticks} onChange={setTicks} disabled={running} />
              <span style={{ fontSize: 12.5, color: C.muted, fontFamily: FF_MONO }}>
                1 vCPU · 512 MB · settles every tick
              </span>
            </>
          )}

          <button
            className="ag-btn"
            onClick={running ? stop : start}
            style={{ background: running ? C.navyLight : C.accent, color: running ? C.ink : "#FFFFFF" }}
          >
            {running ? <span className="ag-spinner" /> : <span>▶</span>}
            <span>{running ? "Stop" : "Run agent"}</span>
          </button>

          {settlements.length > 0 && (
            <span style={{ fontSize: 12.5, color: C.muted, fontFamily: FF_MONO }}>
              {paid.length} payment{paid.length === 1 ? "" : "s"} · {fmtHbar(spent)} spent
              {settlements.length > paid.length ? ` · ${settlements.length - paid.length} payout` : ""}
            </span>
          )}
        </div>
      </Card>

      <Card pad={events.length ? "8px 24px 20px" : 24}>
        {events.length === 0 ? (
          <Empty text="Nothing running — hit Run agent to watch a payment happen live." />
        ) : (
          <div>
            {events.map((event, i) => (
              <Step key={event.seq} event={event} last={i === events.length - 1} />
            ))}
            <div ref={tailRef} />
          </div>
        )}
      </Card>
    </section>
  );
}

function Field({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  disabled: boolean;
}) {
  return (
    <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span style={{ fontSize: 12.5, color: C.muted, fontFamily: FF_MONO }}>{label}</span>
      <input
        type="number"
        min={1}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Math.max(1, Number(e.target.value)))}
        style={{ width: 84, borderRadius: 999, padding: "9px 14px" }}
      />
    </label>
  );
}

function Step({ event, last }: { event: LiveEvent; last: boolean }) {
  const meta = PHASE[event.phase];
  return (
    <div style={{ display: "flex", gap: 14, animation: "ag-fade .25s ease" }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0 }}>
        <span
          style={{
            width: 34,
            height: 34,
            borderRadius: "50%",
            background: `${meta.tint}1F`,
            color: meta.tint,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: event.phase === "challenge" ? 10 : 13,
            fontFamily: FF_HEAD,
            fontWeight: 500,
            marginTop: 12,
          }}
        >
          {meta.icon}
        </span>
        {!last && <span style={{ flex: 1, width: 1, background: C.border, minHeight: 12 }} />}
      </div>

      <div style={{ minWidth: 0, flex: 1, padding: "14px 0" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span style={{ fontSize: 14.5, fontWeight: 500, color: C.white, fontFamily: FF_HEAD }}>
            {event.label}
          </span>
          {event.hbar != null && event.phase !== "done" && (
            <Badge tone={event.phase === "settle" ? "pass" : "warn"}>
              {event.direction === "received" ? "↓ " : ""}
              {fmtHbar(event.hbar)}
            </Badge>
          )}
          {event.phase === "done" && event.hbar != null && (
            <Badge tone="pass">total {fmtHbar(event.hbar)}</Badge>
          )}
          <span style={{ fontSize: 11.5, color: C.faint, fontFamily: FF_MONO, marginLeft: "auto" }}>
            {event.at.slice(11, 19)}
          </span>
        </div>

        {event.detail && (
          <div style={{ fontSize: 13, color: C.muted, fontFamily: FF_MONO, marginTop: 4, wordBreak: "break-word" }}>
            {event.detail}
          </div>
        )}

        {event.hashscan && event.transaction && (
          <div style={{ fontSize: 12.5, fontFamily: FF_MONO, marginTop: 6 }}>
            <a className="ag-link" href={event.hashscan} target="_blank" rel="noreferrer">
              {shortId(event.transaction)} ↗
            </a>
          </div>
        )}

        {event.text && (
          <pre
            style={{
              margin: "10px 0 0",
              background: C.navy,
              borderRadius: 16,
              padding: 14,
              fontSize: 12.5,
              lineHeight: 1.6,
              color: C.ink,
              fontFamily: FF_MONO,
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              maxHeight: 260,
              overflow: "auto",
            }}
          >
            {event.text}
          </pre>
        )}
      </div>
    </div>
  );
}
