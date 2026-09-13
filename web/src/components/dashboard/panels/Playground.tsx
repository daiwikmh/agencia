import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { Badge, Card, Empty, SectionTitle, StatTile } from "../ui.js";
import { C, FF_HEAD, FF_MONO } from "../theme.js";
import { fmtHbar, priceLabel, shortId, timeAgo } from "../format.js";
import { refresh, useBudgets, useResource, useSessionCalls } from "../store.js";
import { CATEGORY_ICON, type CallOutcome, type HealthResp, type ManifestResp } from "../types.js";

export default function Playground() {
  const { data: manifestResp } = useResource<ManifestResp>("manifest");
  const { data: health } = useResource<HealthResp>("health");
  const [budgets] = useBudgets();
  const [calls, updateCalls] = useSessionCalls();

  const resources = manifestResp?.manifest?.resources ?? [];
  const reachable = health?.reachable ?? false;

  const [tool, setTool] = useState("");
  const selected = resources.find((r) => r.tool === tool) ?? resources[0];
  const params = selected?.params ?? [];

  const [values, setValues] = useState<Record<string, string>>({});
  const [running, setRunning] = useState(false);
  const [outcome, setOutcome] = useState<CallOutcome | null>(null);

  useEffect(() => {
    if (!selected) return;
    setTool(selected.tool);
    setValues(
      Object.fromEntries(
        (selected.params ?? []).map((p) => [p.name, p.default != null ? String(p.default) : ""]),
      ),
    );
    setOutcome(null);
  }, [selected?.tool]);

  const args = useMemo(() => {
    const out: Record<string, unknown> = {};
    for (const p of params) {
      const raw = values[p.name];
      if (raw == null || raw === "") continue;
      out[p.name] = p.type === "number" ? Number(raw) : raw;
    }
    return out;
  }, [params, values]);

  const requestBody = useMemo(
    () =>
      JSON.stringify(
        {
          tool,
          args,
          ...(budgets.perCallEnabled ? { maxHbar: budgets.perCallHbar } : {}),
        },
        null,
        2,
      ),
    [tool, args, budgets],
  );

  const missingRequired = params.some((p) => p.required && !values[p.name]?.trim());

  const run = async () => {
    if (running || missingRequired || !selected) return;
    const id = crypto.randomUUID();
    const summary =
      params.map((p) => values[p.name]).find((v) => v && v.trim()) ?? selected.title ?? tool;
    setRunning(true);
    setOutcome(null);
    updateCalls((prev) => [
      { id, tool, summary, at: new Date().toISOString(), status: "running" },
      ...prev,
    ]);
    try {
      const res = await fetch("/api/call", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: requestBody,
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

  if (!selected) {
    return (
      <section>
        <SectionTitle>Playground</SectionTitle>
        <Card>
          <Empty
            text={manifestResp?.error ?? "No services available — is the Agencia service running?"}
          />
        </Card>
      </section>
    );
  }

  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div>
        <SectionTitle>Call any service</SectionTitle>
        <select
          value={tool}
          onChange={(e) => setTool(e.target.value)}
          style={{ width: "100%", background: C.card, borderRadius: 999, padding: "13px 20px" }}
        >
          {resources.map((r) => (
            <option key={r.resource} value={r.tool}>
              {CATEGORY_ICON[r.category ?? ""] ?? "◆"} {r.title ?? r.tool} — {r.category}
            </option>
          ))}
        </select>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)",
          gap: 20,
          alignItems: "start",
        }}
      >
        <Card>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: C.white, fontFamily: FF_HEAD }}>
                {selected.title ?? selected.tool}
              </div>
              <div style={{ fontSize: 12, color: C.muted, marginTop: 3, lineHeight: 1.5 }}>
                {selected.description}
              </div>
              <div style={{ fontSize: 11, color: C.accent, fontFamily: FF_MONO, marginTop: 6 }}>
                {priceLabel(selected.pricing)}
              </div>
            </div>

            {params.length === 0 && (
              <div style={{ fontSize: 12, color: C.faint, fontFamily: FF_MONO }}>
                No parameters — just call it.
              </div>
            )}

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
                {running ? <span className="ag-spinner" /> : <span>▷</span>}
                <span>{running ? "Paying & calling…" : "Pay & call"}</span>
              </button>
              {!reachable && <Badge tone="warn">service offline</Badge>}
              {budgets.perCallEnabled && (
                <span style={{ fontSize: 10, color: C.faint, fontFamily: FF_MONO }}>
                  cap {fmtHbar(budgets.perCallHbar)}
                </span>
              )}
            </div>
          </div>
        </Card>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div>
            <div style={miniTitle}>Request · POST /api/call</div>
            <pre style={codeBox}>{requestBody}</pre>
          </div>

          <div>
            <div style={miniTitle}>Response</div>
            {!outcome ? (
              <pre style={{ ...codeBox, color: C.faint }}>— run a call to see the response —</pre>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
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
                    <pre style={codeBox}>{outcome.text}</pre>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fit,minmax(120px,1fr))",
                        gap: 8,
                      }}
                    >
                      <StatTile
                        label="Paid"
                        value={fmtHbar(outcome.payment?.quotedHbar ?? 0)}
                        tone="good"
                      />
                      {outcome.usage && <StatTile label="Tokens" value={outcome.usage.total} />}
                      <StatTile
                        label="HCS"
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
                      borderRadius: 18,
                      padding: 16,
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
        </div>
      </div>

      <div>
        <SectionTitle>Recent runs</SectionTitle>
        <Card pad={0}>
          {calls.length ? (
            calls.slice(0, 12).map((c) => (
              <div
                key={c.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 14,
                  padding: "10px 16px",
                  borderBottom: `1px solid ${C.border}`,
                  fontFamily: FF_MONO,
                }}
              >
                <div style={{ minWidth: 0, fontSize: 12 }}>
                  <span style={{ color: C.accent }}>{c.tool}</span>{" "}
                  <span style={{ color: C.muted }}>{c.summary}</span>
                  <span style={{ color: C.faint, marginLeft: 8 }}>{timeAgo(c.at)}</span>
                </div>
                <div style={{ flexShrink: 0 }}>
                  {c.status === "running" && <Badge tone="neutral">running</Badge>}
                  {c.status === "ok" && (
                    <Badge tone="pass">{c.hbar ? fmtHbar(c.hbar) : "paid"}</Badge>
                  )}
                  {c.status === "error" && <Badge tone="breach">failed</Badge>}
                </div>
              </div>
            ))
          ) : (
            <div style={{ padding: 16 }}>
              <Empty text="No runs this session." />
            </div>
          )}
        </Card>
      </div>
    </section>
  );
}

const labelStyle: CSSProperties = {
  display: "block",
  fontSize: 12,
  color: C.muted,
  fontFamily: FF_MONO,
  marginBottom: 7,
};

const miniTitle: CSSProperties = {
  fontSize: 12,
  color: C.muted,
  fontFamily: FF_MONO,
  marginBottom: 8,
};

const codeBox: CSSProperties = {
  margin: 0,
  background: C.card,
  border: "none",
  borderRadius: 18,
  padding: 16,
  fontSize: 11.5,
  lineHeight: 1.55,
  color: C.ink,
  fontFamily: FF_MONO,
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
  maxHeight: 340,
  overflow: "auto",
};
