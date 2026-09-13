import { useEffect, useRef, useState } from "react";
import { Badge, Card } from "../ui.js";
import { C, FF_HEAD, FF_MONO } from "../theme.js";
import { fmtHbar, shortId } from "../format.js";
import { useResource } from "../store.js";
import type { ManifestResp } from "../types.js";

interface StreamEvent {
  seq: number;
  phase: "start" | "tick" | "done" | "error";
  label: string;
  detail?: string;
  hbar?: number;
  transaction?: string;
  hashscan?: string;
  scheduleId?: string | null;
  at: string;
}

export default function StreamCard() {
  const { data: manifestResp } = useResource<ManifestResp>("manifest");
  const [events, setEvents] = useState<StreamEvent[]>([]);
  const [running, setRunning] = useState(false);
  const [rate, setRate] = useState(0.001);
  const [tickSeconds, setTickSeconds] = useState(5);
  const [ticks, setTicks] = useState(4);
  const sourceRef = useRef<EventSource | null>(null);

  const payTo = manifestResp?.manifest?.resources[0]?.payTo ?? "";
  const streamed = events.filter((e) => e.phase === "tick");
  const total = streamed.reduce((s, e) => s + (e.hbar ?? 0), 0);

  useEffect(() => () => sourceRef.current?.close(), []);

  const start = () => {
    if (running || !payTo) return;
    setEvents([]);
    setRunning(true);
    const params = new URLSearchParams({
      payTo,
      rate: String(rate),
      tickSeconds: String(tickSeconds),
      ticks: String(ticks),
    });
    const source = new EventSource(`/api/stream?${params}`);
    sourceRef.current = source;
    source.onmessage = (message) => {
      const event = JSON.parse(message.data) as StreamEvent;
      setEvents((prev) => [...prev, event]);
      if (event.phase === "done" || event.phase === "error") {
        source.close();
        setRunning(false);
      }
    };
    source.onerror = () => {
      source.close();
      setRunning(false);
    };
  };

  return (
    <Card pad="22px 24px">
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
        <span style={{ fontSize: 15, fontWeight: 500, color: C.white, fontFamily: FF_HEAD }}>
          Streamed payments · Scheduled Transactions
        </span>
        <Badge tone="accent">HIP-423</Badge>
      </div>
      <p style={{ margin: "0 0 16px", fontSize: 13, lineHeight: 1.6, color: C.muted, maxWidth: 640 }}>
        A second rail beside x402: instead of settling on each call, the agent creates one Hedera
        Scheduled Transaction per interval. Use it for bandwidth, subscriptions, or any meter that
        bills on time rather than on requests.
      </p>

      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <NumField label="ℏ / second" value={rate} step={0.001} onChange={setRate} disabled={running} />
        <NumField label="every (s)" value={tickSeconds} step={1} onChange={setTickSeconds} disabled={running} />
        <NumField label="ticks" value={ticks} step={1} onChange={setTicks} disabled={running} />
        <span style={{ fontSize: 12.5, color: C.muted, fontFamily: FF_MONO }}>
          → {fmtHbar(rate * tickSeconds * ticks)} over {tickSeconds * ticks}s to {shortId(payTo)}
        </span>
        <button
          className="ag-btn"
          onClick={start}
          disabled={running || !payTo}
          style={{ background: C.accent, color: "#FFFFFF" }}
        >
          {running ? <span className="ag-spinner" /> : <span>≈</span>}
          <span>{running ? "Streaming…" : "Start stream"}</span>
        </button>
        {streamed.length > 0 && (
          <span style={{ fontSize: 12.5, color: C.muted, fontFamily: FF_MONO }}>
            {streamed.length} scheduled · {fmtHbar(total)}
          </span>
        )}
      </div>

      {events.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {events.map((event) => (
            <div
              key={event.seq}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                flexWrap: "wrap",
                padding: "10px 14px",
                borderRadius: 14,
                background: event.phase === "error" ? C.redBg : C.navy,
                fontSize: 12.5,
                fontFamily: FF_MONO,
                color: event.phase === "error" ? C.red : C.ink,
              }}
            >
              <span style={{ color: event.phase === "tick" ? C.green : C.muted }}>
                {event.phase === "tick" ? "✓" : event.phase === "done" ? "★" : "·"}
              </span>
              <span style={{ color: C.white }}>{event.label}</span>
              {event.detail && <span style={{ color: C.muted }}>{event.detail}</span>}
              {event.hbar != null && <Badge tone="pass">{fmtHbar(event.hbar)}</Badge>}
              {event.hashscan && (
                <a className="ag-link" href={event.hashscan} target="_blank" rel="noreferrer">
                  {shortId(event.transaction ?? "")} ↗
                </a>
              )}
              <span style={{ marginLeft: "auto", color: C.faint }}>{event.at.slice(11, 19)}</span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function NumField({
  label,
  value,
  step,
  onChange,
  disabled,
}: {
  label: string;
  value: number;
  step: number;
  onChange: (n: number) => void;
  disabled: boolean;
}) {
  return (
    <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span style={{ fontSize: 12.5, color: C.muted, fontFamily: FF_MONO }}>{label}</span>
      <input
        type="number"
        min={step}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Math.max(step, Number(e.target.value)))}
        style={{ width: 92, borderRadius: 999, padding: "9px 14px" }}
      />
    </label>
  );
}
