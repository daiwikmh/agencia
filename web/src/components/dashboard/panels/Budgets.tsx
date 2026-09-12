import { Card, SectionTitle } from "../ui.js";
import { C, FF_HEAD, FF_MONO } from "../theme.js";
import { fmtHbar } from "../format.js";
import { useBudgets, useSessionCalls } from "../store.js";

function Toggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={on}
      style={{
        width: 38,
        height: 22,
        borderRadius: 999,
        border: `1px solid ${on ? C.accent : C.border}`,
        background: on ? C.accentBg : C.navy,
        position: "relative",
        cursor: "pointer",
        flexShrink: 0,
      }}
    >
      <span
        style={{
          position: "absolute",
          top: 2,
          left: on ? 18 : 2,
          width: 16,
          height: 16,
          borderRadius: "50%",
          background: on ? C.accent : C.faint,
          transition: "left .15s ease",
        }}
      />
    </button>
  );
}

function AmountField({
  value,
  suffix,
  onChange,
}: {
  value: number;
  suffix: string;
  onChange: (n: number) => void;
}) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
      <input
        type="number"
        min={0}
        step={0.001}
        value={value}
        onChange={(e) => onChange(Math.max(0, Number(e.target.value)))}
        style={{ width: 130, fontSize: 22, fontWeight: 700, fontFamily: FF_HEAD, padding: "4px 8px" }}
      />
      <span style={{ fontSize: 12, color: C.faint, fontFamily: FF_MONO }}>{suffix}</span>
    </div>
  );
}

export default function Budgets() {
  const [budgets, patch] = useBudgets();
  const [calls] = useSessionCalls();

  const spent = calls
    .filter((c) => c.status === "ok")
    .reduce((s, c) => s + (c.hbar ?? 0), 0);
  const running = calls.filter((c) => c.status === "running").length;
  const available = Math.max(0, budgets.dailyHbar - spent);
  const pct = budgets.dailyHbar > 0 ? Math.min(100, (spent / budgets.dailyHbar) * 100) : 0;

  return (
    <section>
      <SectionTitle>Budgets · spending controls</SectionTitle>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))",
          gap: 16,
        }}
      >
        <Card>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 12,
            }}
          >
            <span style={{ fontSize: 13, fontWeight: 700, color: C.white, fontFamily: FF_HEAD }}>
              ☀ Session budget
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 10, color: C.faint, fontFamily: FF_MONO }}>
                {budgets.dailyEnabled ? "active" : "paused"}
              </span>
              <Toggle
                on={budgets.dailyEnabled}
                onClick={() => patch({ dailyEnabled: !budgets.dailyEnabled })}
              />
            </div>
          </div>
          <AmountField
            value={budgets.dailyHbar}
            suffix="ℏ / session"
            onChange={(n) => patch({ dailyHbar: n })}
          />
          <div style={{ fontSize: 11, color: C.muted, fontFamily: FF_MONO, margin: "12px 0 6px" }}>
            Spent {fmtHbar(spent)} · {running} running · Available {fmtHbar(available)}
          </div>
          <div style={{ height: 6, background: C.navy, borderRadius: 4, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${pct}%`, background: pct > 90 ? C.red : C.accent }} />
          </div>
        </Card>

        <Card>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 12,
            }}
          >
            <span style={{ fontSize: 13, fontWeight: 700, color: C.white, fontFamily: FF_HEAD }}>
              ⛨ Per call
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 10, color: C.faint, fontFamily: FF_MONO }}>
                {budgets.perCallEnabled ? "active" : "paused"}
              </span>
              <Toggle
                on={budgets.perCallEnabled}
                onClick={() => patch({ perCallEnabled: !budgets.perCallEnabled })}
              />
            </div>
          </div>
          <AmountField
            value={budgets.perCallHbar}
            suffix="ℏ / call"
            onChange={(n) => patch({ perCallHbar: n })}
          />
          <div style={{ fontSize: 11, color: C.muted, fontFamily: FF_MONO, marginTop: 12 }}>
            When active, a quote above this cap is rejected before payment.
          </div>
        </Card>
      </div>
    </section>
  );
}
