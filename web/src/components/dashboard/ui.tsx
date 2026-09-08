import type { CSSProperties, ReactNode } from "react";
import { C, FF_HEAD, FF_MONO } from "./theme.js";

export function Card({
  children,
  pad = 20,
  style,
}: {
  children: ReactNode;
  pad?: number | string;
  style?: CSSProperties;
}) {
  return (
    <div
      style={{
        background: C.card,
        border: `1px solid ${C.border}`,
        borderRadius: 16,
        padding: pad,
        minWidth: 0,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function SectionTitle({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div
      style={{
        fontSize: 11,
        fontWeight: 700,
        color: C.muted,
        letterSpacing: "0.11em",
        textTransform: "uppercase",
        fontFamily: FF_HEAD,
        marginBottom: 12,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function StatTile({
  label,
  value,
  sub,
  tone = "default",
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: "default" | "good" | "warn" | "bad";
}) {
  const fg =
    tone === "good" ? C.green : tone === "warn" ? C.amber : tone === "bad" ? C.red : C.white;
  const bd =
    tone === "good" ? C.green : tone === "warn" ? C.amber : tone === "bad" ? C.red : C.border;
  const bg =
    tone === "good"
      ? C.greenBg
      : tone === "warn"
        ? C.amberBg
        : tone === "bad"
          ? C.redBg
          : C.navy;
  return (
    <div style={{ background: bg, border: `1px solid ${bd}`, borderRadius: 12, padding: "13px 15px" }}>
      <div
        style={{
          fontSize: 9,
          color: tone === "default" ? C.faint : fg,
          letterSpacing: "0.13em",
          textTransform: "uppercase",
          fontFamily: FF_MONO,
          marginBottom: 5,
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: 19, fontWeight: 700, color: fg, fontFamily: FF_HEAD, wordBreak: "break-word" }}>
        {value}
      </div>
      {sub != null && <div style={{ fontSize: 10, color: C.faint, marginTop: 3, fontFamily: FF_MONO }}>{sub}</div>}
    </div>
  );
}

type Tone = "pass" | "warn" | "breach" | "neutral" | "accent";
const TONES: Record<Tone, { fg: string; bg: string; bd: string }> = {
  pass: { fg: C.green, bg: C.greenBg, bd: C.green },
  warn: { fg: C.amber, bg: C.amberBg, bd: C.amber },
  breach: { fg: C.red, bg: C.redBg, bd: C.red },
  neutral: { fg: C.muted, bg: "transparent", bd: C.border },
  accent: { fg: C.accent, bg: C.accentBg, bd: C.accent },
};

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: Tone }) {
  const t = TONES[tone];
  return (
    <span
      style={{
        display: "inline-block",
        fontSize: 10,
        fontWeight: 700,
        fontFamily: FF_MONO,
        letterSpacing: "0.06em",
        borderRadius: 20,
        padding: "2px 10px",
        color: t.fg,
        background: t.bg,
        border: `1px solid ${t.bd}`,
      }}
    >
      {children}
    </span>
  );
}

export function Dot({ tone }: { tone: "good" | "warn" | "bad" }) {
  const c = tone === "good" ? C.green : tone === "warn" ? C.amber : C.red;
  return (
    <span
      style={{
        width: 7,
        height: 7,
        borderRadius: "50%",
        background: c,
        flexShrink: 0,
        boxShadow: `0 0 0 3px ${c}22`,
      }}
    />
  );
}

export function Empty({ text }: { text: string }) {
  return (
    <div
      style={{
        fontSize: 12,
        color: C.faint,
        fontFamily: FF_MONO,
        textAlign: "center",
        padding: "10px 0",
      }}
    >
      {text}
    </div>
  );
}

export function KV({ k, v }: { k: string; v: ReactNode }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 16, padding: "7px 0", borderBottom: `1px solid ${C.border}` }}>
      <span style={{ fontSize: 11, color: C.faint, fontFamily: FF_MONO, letterSpacing: "0.04em" }}>{k}</span>
      <span style={{ fontSize: 12, color: C.ink, fontFamily: FF_MONO, textAlign: "right", wordBreak: "break-all" }}>{v}</span>
    </div>
  );
}
