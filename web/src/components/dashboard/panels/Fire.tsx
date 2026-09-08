import { useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { Badge, Card, SectionTitle, StatTile } from "../ui.js";
import { C, FF_HEAD, FF_MONO } from "../theme.js";
import { fmtHbar, shortId } from "../format.js";
import { refresh, useResource, useSessionCalls } from "../store.js";
import type { InferOutcome, ManifestResp } from "../types.js";

export default function Fire() {
  const { data: manifestResp } = useResource<ManifestResp>("manifest");
  const { data: health } = useResource<{ reachable?: boolean }>("health");
  const [, updateCalls] = useSessionCalls();

  const manifest = manifestResp?.manifest ?? null;
  const reachable = health?.reachable ?? false;

  const [prompt, setPrompt] = useState(
    "In two sentences, what does the x402 payment standard change about API access?",
  );
  const [maxTokens, setMaxTokens] = useState(256);
  const [running, setRunning] = useState(false);
  const [outcome, setOutcome] = useState<InferOutcome | null>(null);

  const inferResource = manifest?.resources.find((r) => r.tool === "infer");
  const quote = useMemo(() => {
    const p = inferResource?.pricing;
    if (!p || p.perCallHbar == null || p.per1kTokenHbar == null) return null;
    return p.perCallHbar + p.per1kTokenHbar * (maxTokens / 1000);
  }, [inferResource, maxTokens]);

  const fire = async () => {
    if (running || !prompt.trim()) return;
    const id = crypto.randomUUID();
    setRunning(true);
    setOutcome(null);
    updateCalls((prev) => [
      { id, prompt, maxTokens, at: new Date().toISOString(), status: "running" },
      ...prev,
    ]);
    try {
      const res = await fetch("/api/infer", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prompt, maxTokens }),
      });
      const data = (await res.json()) as InferOutcome;
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
      if (data.ok) refresh("audit");
    } catch (err) {
      setOutcome({ ok: false, error: String(err), steps: [] });
      updateCalls((prev) => prev.map((c) => (c.id === id ? { ...c, status: "error" } : c)));
    } finally {
      setRunning(false);
    }
  };

  return (
    <section>
      <SectionTitle>Fire a paid request</SectionTitle>
      <Card>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <label style={labelStyle}>Prompt</label>
            <textarea
              rows={3}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Ask the paid model…"
            />
          </div>
          <div style={{ display: "flex", gap: 18, alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ flex: "1 1 260px" }}>
              <label style={labelStyle}>
                max_tokens: <span style={{ color: C.ink }}>{maxTokens}</span>
              </label>
              <input
                type="range"
                min={16}
                max={2048}
                step={16}
                value={maxTokens}
                onChange={(e) => setMaxTokens(Number(e.target.value))}
                style={{ width: "100%" }}
              />
            </div>
            <div style={{ textAlign: "right" }}>
              <div
                style={{
                  fontSize: 9,
                  color: C.faint,
                  fontFamily: FF_MONO,
                  letterSpacing: "0.13em",
                  textTransform: "uppercase",
                }}
              >
                Quote
              </div>
              <div style={{ fontSize: 20, fontWeight: 700, color: C.accent, fontFamily: FF_HEAD }}>
                {quote != null ? fmtHbar(quote) : "—"}
              </div>
              <div style={{ fontSize: 10, color: C.faint, fontFamily: FF_MONO }}>
                {inferResource?.pricing.model ?? "per-call + per-token"}
              </div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <button
              className="ag-btn"
              style={{ background: C.accent, color: "#06201d" }}
              disabled={running || !reachable || !prompt.trim()}
              onClick={fire}
            >
              {running ? <span className="ag-spinner" /> : "⚡"}
              {running ? "Paying & calling…" : "Pay & call"}
            </button>
            {!reachable && <Badge tone="warn">service offline</Badge>}
          </div>

          {outcome && (
            <div
              style={{
                borderTop: `1px solid ${C.border}`,
                paddingTop: 14,
                display: "flex",
                flexDirection: "column",
                gap: 12,
                animation: "ag-fade .2s ease",
              }}
            >
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {outcome.steps.map((s, i) => (
                  <div
                    key={i}
                    style={{
                      fontSize: 11.5,
                      color: C.muted,
                      fontFamily: FF_MONO,
                      display: "flex",
                      gap: 8,
                    }}
                  >
                    <span style={{ color: C.accent }}>{String(i + 1).padStart(2, "0")}</span>
                    {s}
                  </div>
                ))}
              </div>

              {outcome.ok ? (
                <>
                  <div
                    style={{
                      background: C.navy,
                      border: `1px solid ${C.border}`,
                      borderRadius: 10,
                      padding: 14,
                      fontSize: 13,
                      lineHeight: 1.6,
                      color: C.ink,
                      whiteSpace: "pre-wrap",
                    }}
                  >
                    {outcome.text}
                  </div>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))",
                      gap: 10,
                    }}
                  >
                    <StatTile
                      label="Paid"
                      value={fmtHbar(outcome.payment?.quotedHbar ?? 0)}
                      tone="good"
                    />
                    <StatTile
                      label="Tokens used"
                      value={outcome.usage?.total ?? "—"}
                      sub={`${outcome.usage?.prompt ?? 0} in / ${outcome.usage?.completion ?? 0} out`}
                    />
                    <StatTile
                      label="HCS receipt"
                      value={outcome.payment?.hcs ? `#${outcome.payment.hcs.sequenceNumber}` : "—"}
                      tone={outcome.payment?.hcs ? "good" : "warn"}
                    />
                  </div>
                  {outcome.payment && (
                    <div style={{ fontSize: 11.5, fontFamily: FF_MONO, color: C.muted }}>
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
                    border: `1px solid ${C.red}`,
                    borderRadius: 10,
                    padding: 12,
                    fontSize: 12.5,
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
      </Card>
    </section>
  );
}

const labelStyle: CSSProperties = {
  display: "block",
  fontSize: 9,
  color: C.faint,
  fontFamily: FF_MONO,
  letterSpacing: "0.13em",
  textTransform: "uppercase",
  marginBottom: 6,
};
