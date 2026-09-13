import type { CSSProperties, ReactNode } from "react";
import { C, FF_HEAD, FF_MONO, RADIUS } from "./theme.js";

export function Card({
  children,
  pad = 24,
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
        border: "none",
        borderRadius: RADIUS.card,
        boxShadow: "0 1px 3px rgba(22,28,40,0.05)",
        padding: pad,
        minWidth: 0,
        overflow: "hidden",
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
        fontSize: 22,
        fontWeight: 500,
        color: C.white,
        letterSpacing: "-0.03em",
        fontFamily: FF_HEAD,
        marginBottom: 16,
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
  const bg = tone === "warn" ? C.amberBg : tone === "bad" ? C.redBg : C.card;
  return (
    <div
      style={{
        background: bg,
        borderRadius: RADIUS.panel,
        padding: "18px 20px",
        boxShadow: bg === C.card ? "0 1px 3px rgba(22,28,40,0.05)" : "none",
      }}
    >
      <div
        style={{
          fontSize: 11,
          color: tone === "default" ? C.muted : fg,
          fontFamily: FF_MONO,
          marginBottom: 10,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 34,
          fontWeight: 400,
          letterSpacing: "-0.045em",
          color: fg,
          fontFamily: FF_HEAD,
          wordBreak: "break-word",
          lineHeight: 1.05,
        }}
      >
        {value}
      </div>
      {sub != null && (
        <div style={{ fontSize: 11, color: C.faint, marginTop: 7, fontFamily: FF_MONO }}>{sub}</div>
      )}
    </div>
  );
}

type Tone = "pass" | "warn" | "breach" | "neutral" | "accent";
const TONES: Record<Tone, { fg: string; bg: string }> = {
  pass: { fg: "#FFFFFF", bg: C.white },
  warn: { fg: C.amber, bg: C.amberBg },
  breach: { fg: C.accent, bg: C.accentBg },
  neutral: { fg: C.muted, bg: C.navyLight },
  accent: { fg: C.accent, bg: C.accentBg },
};

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: Tone }) {
  const t = TONES[tone];
  return (
    <span
      style={{
        display: "inline-block",
        fontSize: 11,
        fontWeight: 500,
        fontFamily: FF_MONO,
        borderRadius: 999,
        padding: "4px 12px",
        color: t.fg,
        background: t.bg,
        whiteSpace: "nowrap",
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
        fontSize: 12.5,
        color: C.faint,
        fontFamily: FF_MONO,
        textAlign: "center",
        padding: "12px 0",
      }}
    >
      {text}
    </div>
  );
}

export function FactRow({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        display: "grid",
        gridAutoFlow: "column",
        gridAutoColumns: "1fr",
        gap: 0,
      }}
    >
      {children}
    </div>
  );
}

export function Fact({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: ReactNode;
  tone?: "default" | "good" | "warn" | "bad";
}) {
  const fg = tone === "good" ? C.green : tone === "warn" ? C.amber : tone === "bad" ? C.red : C.white;
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 8,
        minWidth: 0,
        padding: "2px 0 2px 18px",
        borderLeft: `1px solid ${C.border}`,
      }}
    >
      <span style={{ fontSize: 12, color: C.muted, fontFamily: FF_MONO }}>{label}</span>
      <strong
        style={{
          fontSize: 26,
          fontWeight: 400,
          letterSpacing: "-0.04em",
          color: fg,
          fontFamily: FF_HEAD,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {value}
      </strong>
    </div>
  );
}

export function KV({ k, v }: { k: string; v: ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: 16,
        padding: "9px 0",
        borderBottom: `1px solid ${C.border}`,
      }}
    >
      <span style={{ fontSize: 12, color: C.faint, fontFamily: FF_MONO }}>{k}</span>
      <span
        style={{
          fontSize: 12.5,
          color: C.ink,
          fontFamily: FF_MONO,
          textAlign: "right",
          wordBreak: "break-all",
        }}
      >
        {v}
      </span>
    </div>
  );
}
