import { useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { Badge, StatTile } from "../ui.js";
import { C, FF_HEAD, FF_MONO } from "../theme.js";
import { fmtHbar, priceLabel, shortId } from "../format.js";
import { refresh, useBudgets, useSessionCalls } from "../store.js";
import { CATEGORY_ICON, type CallOutcome, type ManifestResource } from "../types.js";

export default function ToolCard({
  resource,
  reachable,
  featured = false,
  defaultOpen = false,
}: {
  resource: ManifestResource;
  reachable: boolean;
  featured?: boolean;
  defaultOpen?: boolean;
}) {
  const params = resource.params ?? [];
  const [open, setOpen] = useState(defaultOpen);
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(params.map((p) => [p.name, p.default != null ? String(p.default) : ""])),
  );
  const [running, setRunning] = useState(false);
  const [outcome, setOutcome] = useState<CallOutcome | null>(null);
  const [budgets] = useBudgets();
  const [, updateCalls] = useSessionCalls();

  const missingRequired = useMemo(
    () => params.some((p) => p.required && !values[p.name]?.trim()),
    [params, values],
  );

  const run = async () => {
    if (running || missingRequired) return;
    const id = crypto.randomUUID();
    const args: Record<string, unknown> = {};
    for (const p of params) {
      const raw = values[p.name];
      if (raw == null || raw === "") continue;
      args[p.name] = p.type === "number" ? Number(raw) : raw;
    }
    const summary =
      params.map((p) => values[p.name]).find((v) => v && v.trim()) ?? resource.title ?? resource.tool;

    setRunning(true);
    setOutcome(null);
    updateCalls((prev) => [
      { id, tool: resource.tool, summary, at: new Date().toISOString(), status: "running" },
      ...prev,
    ]);

    try {
      const res = await fetch("/api/call", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          tool: resource.tool,
          args,
          maxHbar: budgets.perCallEnabled ? budgets.perCallHbar : undefined,
        }),
      });
      const data = (await res.json()) as CallOutcome;
      setOutcome(data);
      updateCalls((prev) =>
        prev.map((c) =>
          c.id === id
            ? {
                ...c,
                status: data.ok ? "ok" : "error",
                hbar: data.payment?.quotedHbar,
                txId: data.payment?.transaction,
              }
            : c,
        ),
      );
      if (data.ok) {
        refresh("audit");
        refresh("wallet");
      }
    } catch (err) {
      setOutcome({ ok: false, error: String(err), steps: [] });
      updateCalls((prev) => prev.map((c) => (c.id === id ? { ...c, status: "error" } : c)));
    } finally {
      setRunning(false);
    }
  };

  return (
    <div
      style={{
        border: featured ? `1px solid ${C.accent}` : "none",
        borderRadius: 22,
        background: C.card,
        boxShadow: "0 1px 3px rgba(22,28,40,0.05)",
        overflow: "hidden",
      }}
    >
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          width: "100%",
          textAlign: "left",
          background: "none",
          border: "none",
          cursor: "pointer",
          padding: 20,
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span
            style={{
              width: 42,
              height: 42,
              borderRadius: 14,
              background: C.navy,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 16,
              flexShrink: 0,
            }}
          >
            {CATEGORY_ICON[resource.category ?? ""] ?? "◆"}
          </span>
          <span style={{ fontSize: 15, fontWeight: 500, color: C.white, fontFamily: FF_HEAD, flex: 1, letterSpacing: "-0.02em" }}>
            {resource.title ?? resource.tool}
          </span>
          <Badge tone="accent">{resource.category ?? "service"}</Badge>
        </div>
        <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.55 }}>{resource.description}</div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 12.5, color: C.accent, fontFamily: FF_MONO }}>
            {priceLabel(resource.pricing)}
          </span>
          <span style={{ fontSize: 12, color: C.faint, fontFamily: FF_MONO }}>
            {open ? "close ▲" : "call ▾"}
          </span>
        </div>
      </button>

      {open && (
        <div
          style={{
            borderTop: `1px solid ${C.border}`,
            padding: 20,
            display: "flex",
            flexDirection: "column",
            gap: 12,
            background: C.navy,
          }}
        >
          <div style={{ fontSize: 10, color: C.faint, fontFamily: FF_MONO }}>
            <span style={{ color: C.muted }}>{resource.tool}</span> · payTo {shortId(resource.payTo)}
          </div>

          {params.map((p) => (
            <div key={p.name}>
              <label style={labelStyle}>
                {p.label}
                {p.required ? " *" : ""}
              </label>
              {p.multiline ? (
                <textarea
                  rows={4}
                  value={values[p.name] ?? ""}
                  placeholder={p.placeholder}
                  onChange={(e) => setValues((v) => ({ ...v, [p.name]: e.target.value }))}
                  style={{ fontFamily: FF_MONO, fontSize: 12 }}
                />
              ) : (
                <input
                  type={p.type === "number" ? "number" : "text"}
                  value={values[p.name] ?? ""}
                  min={p.min}
                  max={p.max}
                  placeholder={p.placeholder}
                  onChange={(e) => setValues((v) => ({ ...v, [p.name]: e.target.value }))}
                  style={{ width: "100%" }}
                />
              )}
            </div>
          ))}

          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <button
              className="ag-btn"
              style={{ background: C.accent, color: "#FFFFFF" }}
              disabled={running || !reachable || missingRequired}
              onClick={run}
            >
              {running ? <span className="ag-spinner" /> : <span>⚡</span>}
              <span>{running ? "Paying & calling…" : "Pay & call"}</span>
            </button>
            {!reachable && <Badge tone="warn">service offline</Badge>}
            {budgets.perCallEnabled && (
              <span style={{ fontSize: 10, color: C.faint, fontFamily: FF_MONO }}>
                cap {fmtHbar(budgets.perCallHbar)}
              </span>
            )}
          </div>

          {outcome && (
            <div
              style={{
                borderTop: `1px solid ${C.border}`,
                paddingTop: 12,
                display: "flex",
                flexDirection: "column",
                gap: 10,
                animation: "ag-fade .2s ease",
              }}
            >
              {outcome.steps.map((s, i) => (
                <div
                  key={i}
                  style={{ fontSize: 11, color: C.muted, fontFamily: FF_MONO, display: "flex", gap: 8 }}
                >
                  <span style={{ color: C.accent }}>{String(i + 1).padStart(2, "0")}</span>
                  {s}
                </div>
              ))}

              {outcome.ok ? (
                <>
                  <pre
                    style={{
                      margin: 0,
                      background: C.card,
                      border: `1px solid ${C.border}`,
                      borderRadius: 16,
                      padding: 14,
                      fontSize: 12,
                      lineHeight: 1.6,
                      color: C.ink,
                      fontFamily: FF_MONO,
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-word",
                      maxHeight: 320,
                      overflow: "auto",
                    }}
                  >
                    {outcome.text}
                  </pre>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))",
                      gap: 8,
                    }}
                  >
                    <StatTile label="Paid" value={fmtHbar(outcome.payment?.quotedHbar ?? 0)} tone="good" />
                    {outcome.usage && (
                      <StatTile label="Tokens" value={outcome.usage.total} />
                    )}
                    <StatTile
                      label="HCS receipt"
                      value={outcome.payment?.hcs ? `#${outcome.payment.hcs.sequenceNumber}` : "—"}
                      tone={outcome.payment?.hcs ? "good" : "warn"}
                    />
                  </div>
                  {outcome.payment && (
                    <div style={{ fontSize: 11, fontFamily: FF_MONO, color: C.muted }}>
                      tx{" "}
                      <a
                        className="ag-link"
                        href={outcome.payment.hashscan}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {shortId(outcome.payment.transaction)} ↗
                      </a>
                    </div>
                  )}
                </>
              ) : (
                <div
                  style={{
                    background: C.redBg,
                    border: "none",
                    borderRadius: 16,
                    padding: 14,
                    fontSize: 12,
                    color: C.red,
                    fontFamily: FF_MONO,
                  }}
                >
                  {outcome.error}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const labelStyle: CSSProperties = {
  display: "block",
  fontSize: 12,
  color: C.muted,
  fontFamily: FF_MONO,
  marginBottom: 7,
};
