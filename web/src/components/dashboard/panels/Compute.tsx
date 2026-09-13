import { useEffect, useRef, useState } from "react";
import { Badge, Card, Empty, SectionTitle } from "../ui.js";
import { C, FF_HEAD, FF_MONO } from "../theme.js";
import { fmtHbar, shortId } from "../format.js";
import { refresh, useSessionCalls } from "../store.js";
import StreamCard from "./StreamCard.js";

interface Capacity {
  cpus: number | null;
  memMb: number | null;
  runtime: string | null;
  busyLeases: number;
}

interface ProviderRow {
  id: string;
  label: string;
  region: string;
  kind: string;
  available: boolean;
  costPerSecondHbar: number;
  capacity: Capacity | null;
  maxCpu: number;
  maxMemMb: number;
  gpu: boolean;
  payoutAccountId: string | null;
}

interface DirectoryRow {
  id: string;
  label: string;
  kind: string;
  gpu: boolean;
  costHbarPerSecond: number | null;
  status: string;
  docs: string;
}

interface Inventory {
  listRatePerSecondHbar: number;
  openFeeHbar: number;
  tickSeconds: number;
  maxLeaseSeconds: number;
  image: string;
  providers: ProviderRow[];
  directory?: DirectoryRow[];
  error?: string;
}

interface LeaseState {
  leaseId: string;
  leaseToken?: string;
  owner?: string | null;
  ownerEmail?: string | null;
  providerLabel: string;
  cpu: number;
  memMb: number;
  image: string;
  tickHbar: number;
  tickSeconds: number;
  expiresAt: string;
  status: string;
  hbarPaid: number;
  secondsPurchased: number;
  execCount?: number;
  supplierPayout?: { hbar: number; payoutAccountId: string; transaction: string } | null;
}

const IMAGES = [
  { value: "node:22-alpine", label: "Node 22 · alpine" },
  { value: "node:22", label: "Node 22 · debian" },
  { value: "python:3.12-alpine", label: "Python 3.12 · alpine" },
  { value: "python:3.12", label: "Python 3.12 · debian" },
  { value: "alpine:3.20", label: "Alpine 3.20 · bare" },
  { value: "debian:bookworm-slim", label: "Debian bookworm · slim" },
];

interface Line {
  kind: "in" | "out" | "err" | "sys";
  text: string;
}

export default function Compute() {
  const [inventory, setInventory] = useState<Inventory | null>(null);
  const [seconds, setSeconds] = useState(60);
  const [cpu, setCpu] = useState(1);
  const [memMb, setMemMb] = useState(512);
  const [provider, setProvider] = useState("auto");
  const [lease, setLease] = useState<LeaseState | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [command, setCommand] = useState("node -e \"console.log(process.version, require('os').cpus().length + ' cpu')\"");
  const [now, setNow] = useState(Date.now());
  const [autoTick, setAutoTick] = useState(true);
  const [writable, setWritable] = useState(false);
  const [packages, setPackages] = useState("");
  const [pendingInstall, setPendingInstall] = useState<string | null>(null);
  const [image, setImage] = useState("node:22-alpine");
  const [, updateCalls] = useSessionCalls();
  const tailRef = useRef<HTMLDivElement | null>(null);

  const loadInventory = () => {
    fetch(`/api/compute?cpu=${cpu}&memMb=${memMb}`)
      .then((r) => r.json())
      .then(setInventory)
      .catch((err) => setInventory({ error: String(err) } as Inventory));
  };

  useEffect(loadInventory, [cpu, memMb]);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    tailRef.current?.scrollIntoView({ block: "end" });
  }, [lines.length]);

  const tickRef = useRef<() => void>(() => {});
  const leaseId = lease?.leaseId;
  const expiresAt = lease?.expiresAt;
  const leaseStatus = lease?.status;
  const tickSeconds = lease?.tickSeconds ?? 10;
  useEffect(() => {
    if (!autoTick || !leaseId || !expiresAt || leaseStatus === "closed") return;
    const timer = window.setInterval(() => {
      const left = (new Date(expiresAt).getTime() - Date.now()) / 1000;
      if (left <= tickSeconds) tickRef.current();
    }, 1500);
    return () => window.clearInterval(timer);
  }, [autoTick, leaseId, expiresAt, leaseStatus, tickSeconds]);

  const say = (kind: Line["kind"], text: string) =>
    setLines((prev) => [...prev, { kind, text }]);

  const quote = (inventory?.openFeeHbar ?? 0) + (inventory?.listRatePerSecondHbar ?? 0) * seconds * cpu;
  const remaining = lease ? Math.max(0, Math.round((new Date(lease.expiresAt).getTime() - now) / 1000)) : 0;
  const live = !!lease && lease.status !== "closed" && remaining > 0;
  const anyHardware = inventory?.providers?.some((p) => p.available) ?? false;

  const post = async (body: Record<string, unknown>) => {
    const res = await fetch("/api/compute", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    return (await res.json()) as Record<string, unknown>;
  };

  const openLease = async () => {
    if (busy) return;
    setBusy("lease");
    setLines([]);
    say("sys", `requesting ${seconds}s · ${cpu} vCPU · ${memMb} MB — quote ${fmtHbar(quote)}`);
    try {
      const data = (await post({ action: "lease", seconds, cpu, memMb, provider, writable, image })) as {
        ok?: boolean;
        text?: string;
        error?: string;
        payment?: { quotedHbar: number; transaction: string; hcs?: { sequenceNumber: string } | null };
      };
      if (!data.ok) throw new Error(data.error ?? "lease failed");
      const state = JSON.parse(String(data.text)) as LeaseState;
      setLease(state);
      say(
        "sys",
        `paid ${fmtHbar(data.payment?.quotedHbar ?? 0)}${data.payment?.hcs ? ` · HCS #${data.payment.hcs.sequenceNumber}` : ""}`,
      );
      say("sys", `lease ${state.leaseId} open on ${state.providerLabel}`);
      if (data.payment?.transaction) {
        updateCalls((prev) => [
          {
            id: data.payment!.transaction,
            tool: "compute_lease",
            summary: `${seconds}s · ${cpu} vCPU`,
            at: new Date().toISOString(),
            status: "ok",
            hbar: data.payment!.quotedHbar,
            txId: data.payment!.transaction,
          },
          ...prev,
        ]);
      }
      refresh("wallet");
      refresh("audit");
      loadInventory();
    } catch (err) {
      say("err", String(err instanceof Error ? err.message : err));
    } finally {
      setBusy(null);
    }
  };

  const run = async () => {
    if (busy || !lease || !command.trim()) return;
    setBusy("exec");
    say("in", command);
    try {
      const data = (await post({
        action: "exec",
        leaseId: lease.leaseId,
        leaseToken: lease.leaseToken,
        command,
      })) as {
        ok?: boolean;
        error?: string;
        result?: { stdout?: string; stderr?: string; exitCode?: number; durationMs?: number; lease?: LeaseState };
      };
      if (!data.ok) throw new Error(data.error ?? "exec failed");
      const out = (data.result?.stdout ?? "").trimEnd();
      const errText = (data.result?.stderr ?? "").trimEnd();
      if (out) say("out", out);
      if (errText) say("err", errText);
      say("sys", `exit ${data.result?.exitCode} · ${data.result?.durationMs}ms — metered, no extra charge`);
      if (data.result?.lease) setLease(data.result.lease);
    } catch (err) {
      say("err", String(err instanceof Error ? err.message : err));
    } finally {
      setBusy(null);
    }
  };

  const install = async (confirm: boolean) => {
    if (busy || !lease || !packages.trim()) return;
    setBusy("install");
    try {
      const data = (await post({
        action: "install",
        leaseId: lease.leaseId,
        leaseToken: lease.leaseToken,
        packages,
        confirm,
      })) as { ok?: boolean; error?: string; result?: Record<string, unknown> };
      if (!data.ok) throw new Error(data.error ?? "install failed");
      const r = data.result ?? {};
      if (r.confirmationRequired) {
        setPendingInstall(String(r.wouldRun));
        say("sys", `needs your OK: ${r.wouldRun}`);
        return;
      }
      setPendingInstall(null);
      if (Number(r.exitCode) === 0) {
        say("sys", `installed ${packages} — metered against the lease, no extra charge`);
        setPackages("");
      } else {
        say("err", String(r.stderr ?? "install failed").trim());
        if (r.hint) say("sys", String(r.hint));
      }
    } catch (err) {
      say("err", String(err instanceof Error ? err.message : err));
    } finally {
      setBusy(null);
    }
  };

  const tick = async () => {
    if (busy || !lease) return;
    setBusy("tick");
    try {
      const data = (await post({ action: "tick", leaseId: lease.leaseId })) as {
        ok?: boolean;
        text?: string;
        error?: string;
        payment?: { quotedHbar: number; transaction: string; hcs?: { sequenceNumber: string } | null };
      };
      if (!data.ok) throw new Error(data.error ?? "tick failed");
      const state = JSON.parse(String(data.text)) as LeaseState;
      setLease(state);
      say(
        "sys",
        `tick paid ${fmtHbar(data.payment?.quotedHbar ?? 0)}${data.payment?.hcs ? ` · HCS #${data.payment.hcs.sequenceNumber}` : ""} — expires ${state.expiresAt.slice(11, 19)}Z`,
      );
      refresh("wallet");
      refresh("audit");
    } catch (err) {
      say("err", String(err instanceof Error ? err.message : err));
    } finally {
      setBusy(null);
    }
  };

  tickRef.current = () => {
    if (!busy) void tick();
  };

  const end = async () => {
    if (busy || !lease) return;
    setBusy("end");
    try {
      const data = (await post({
        action: "end",
        leaseId: lease.leaseId,
        leaseToken: lease.leaseToken,
      })) as {
        ok?: boolean;
        error?: string;
        result?: LeaseState;
      };
      if (!data.ok) throw new Error(data.error ?? "close failed");
      const state = data.result as LeaseState;
      setLease(state);
      say("sys", `lease closed · ${state.secondsPurchased}s purchased · ${fmtHbar(state.hbarPaid)} paid`);
      if (state.supplierPayout) {
        say(
          "sys",
          `supplier paid ${fmtHbar(state.supplierPayout.hbar)} to ${state.supplierPayout.payoutAccountId}`,
        );
      }
      refresh("wallet");
      loadInventory();
    } catch (err) {
      say("err", String(err instanceof Error ? err.message : err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <SectionTitle style={{ marginBottom: 0 }}>Hardware you can rent by the second</SectionTitle>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))",
          gap: 16,
          alignItems: "start",
        }}
      >
        {inventory?.providers?.length ? (
          inventory.providers.map((p) => (
            <Card key={p.id} pad="20px 22px">
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                <span
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 13,
                    background: C.navy,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 15,
                    flexShrink: 0,
                  }}
                >
                  ▣
                </span>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div
                    style={{
                      fontSize: 14.5,
                      fontWeight: 500,
                      color: C.white,
                      fontFamily: FF_HEAD,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {p.label}
                  </div>
                  <div style={{ fontSize: 11.5, color: C.faint, fontFamily: FF_MONO }}>
                    {p.kind} · {p.region}
                  </div>
                </div>
                <Badge tone={p.available ? "pass" : "warn"}>{p.available ? "online" : "offline"}</Badge>
              </div>

              <Spec label="Host" value={p.capacity?.cpus ? `${p.capacity.cpus} vCPU · ${Math.round((p.capacity.memMb ?? 0) / 1024)} GB` : "declared only"} />
              <Spec label="Max per lease" value={`${p.maxCpu} vCPU · ${p.maxMemMb} MB`} />
              <Spec label="Runtime" value={p.capacity?.runtime ?? inventory.image} />
              <Spec label="Cost basis" value={`${p.costPerSecondHbar} ℏ / vCPU-s`} />
              <Spec label="Active leases" value={String(p.capacity?.busyLeases ?? 0)} />
              {p.payoutAccountId && <Spec label="Payout to" value={p.payoutAccountId} />}
              {p.gpu && (
                <div style={{ marginTop: 10 }}>
                  <Badge tone="accent">GPU</Badge>
                </div>
              )}
            </Card>
          ))
        ) : (
          <Card>
            <Empty
              text={
                inventory?.error ??
                "No compute providers registered — start the local runtime or allowlist a supplier."
              }
            />
          </Card>
        )}
      </div>

      <Card pad="22px 24px">
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12 }}>
          <Field label="seconds" value={seconds} onChange={setSeconds} disabled={!!lease && live} />
          <Field label="vCPU" value={cpu} onChange={setCpu} disabled={!!lease && live} />
          <Field label="MB" value={memMb} step={128} onChange={setMemMb} disabled={!!lease && live} />
          <select
            value={image}
            onChange={(e) => setImage(e.target.value)}
            disabled={!!lease && live}
            title="Runtime image for the box"
            style={{ borderRadius: 999, padding: "9px 16px", background: C.navy }}
          >
            {IMAGES.map((i) => (
              <option key={i.value} value={i.value}>
                {i.label}
              </option>
            ))}
          </select>

          <select
            value={provider}
            onChange={(e) => setProvider(e.target.value)}
            disabled={!!lease && live}
            title="Which machine runs it"
            style={{ borderRadius: 999, padding: "9px 16px", background: C.navy }}
          >
            <option value="auto">cheapest available</option>
            {inventory?.providers?.map((p) => (
              <option key={p.id} value={p.id} disabled={!p.available}>
                {p.label}
                {p.gpu ? " · GPU" : ""}
                {p.available ? ` · ${p.costPerSecondHbar} ℏ/s` : " · offline"}
              </option>
            ))}
          </select>

          <label
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              fontSize: 12.5,
              color: C.muted,
              fontFamily: FF_MONO,
              cursor: live ? "default" : "pointer",
            }}
            title="Relaxes the read-only rootfs so package managers can write. Opt in only if you need to install."
          >
            <input
              type="checkbox"
              checked={writable}
              disabled={!!lease && live}
              onChange={(e) => setWritable(e.target.checked)}
              style={{ accentColor: C.accent, width: 15, height: 15, padding: 0 }}
            />
            installable
          </label>

          <span style={{ fontSize: 12.5, color: C.muted, fontFamily: FF_MONO }}>
            quote {fmtHbar(quote)}
          </span>

          <button
            className="ag-btn"
            onClick={openLease}
            disabled={!!busy || (!!lease && live) || !anyHardware}
            style={{ background: C.accent, color: "#FFFFFF" }}
          >
            {busy === "lease" ? <span className="ag-spinner" /> : <span>⚡</span>}
            <span>{busy === "lease" ? "Paying & starting…" : "Pay & lease"}</span>
          </button>

          {!anyHardware && <Badge tone="warn">no hardware online</Badge>}

          {lease && (
            <>
              <Badge tone={live ? "pass" : "neutral"}>
                {live ? `${remaining}s left` : lease.status}
              </Badge>
              <button className="ag-btn" onClick={tick} disabled={!!busy || lease.status === "closed"} style={{ background: C.navy, color: C.ink }}>
                {busy === "tick" ? <span className="ag-spinner" /> : <span>↻</span>}
                <span>Tick +{lease.tickSeconds}s · {fmtHbar(lease.tickHbar)}</span>
              </button>
              <button className="ag-btn" onClick={end} disabled={!!busy || lease.status === "closed"} style={{ background: C.navy, color: C.ink }}>
                End lease
              </button>
              <label
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  fontSize: 12.5,
                  color: C.muted,
                  fontFamily: FF_MONO,
                  cursor: "pointer",
                }}
              >
                <input
                  type="checkbox"
                  checked={autoTick}
                  onChange={(e) => setAutoTick(e.target.checked)}
                  style={{ accentColor: C.accent, width: 15, height: 15, padding: 0 }}
                />
                stream payments
              </label>
            </>
          )}
        </div>
      </Card>

      <Card pad={0}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "14px 20px",
            borderBottom: `1px solid ${C.border}`,
          }}
        >
          <span style={{ fontSize: 14.5, fontWeight: 500, color: C.white, fontFamily: FF_HEAD }}>
            Terminal
          </span>
          {lease && (
            <span style={{ fontSize: 12, color: C.faint, fontFamily: FF_MONO }}>
              {lease.leaseId} · {lease.cpu} vCPU · {lease.memMb} MB · {lease.image}
              {lease.owner ? ` · owned by ${lease.ownerEmail ?? lease.owner}` : ""}
            </span>
          )}
        </div>

        <div
          style={{
            background: C.navy,
            padding: 18,
            minHeight: 220,
            maxHeight: 380,
            overflow: "auto",
            fontFamily: FF_MONO,
            fontSize: 12.5,
            lineHeight: 1.65,
          }}
        >
          {lines.length === 0 ? (
            <span style={{ color: C.faint }}>
              Open a lease, then run commands on the rented box. Execution is covered by the lease —
              you pay for seconds, not for commands.
            </span>
          ) : (
            lines.map((line, i) => (
              <div
                key={i}
                style={{
                  color:
                    line.kind === "in"
                      ? C.white
                      : line.kind === "err"
                        ? C.red
                        : line.kind === "sys"
                          ? C.muted
                          : C.ink,
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                }}
              >
                {line.kind === "in" ? "$ " : line.kind === "sys" ? "· " : ""}
                {line.text}
              </div>
            ))
          )}
          <div ref={tailRef} />
        </div>

        {live && (
          <div
            style={{
              display: "flex",
              gap: 10,
              padding: "0 16px",
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >
            <input
              value={packages}
              onChange={(e) => {
                setPackages(e.target.value);
                setPendingInstall(null);
              }}
              placeholder="missing a package? e.g. jq python3"
              style={{ flex: 1, minWidth: 200, fontFamily: FF_MONO, fontSize: 12.5, borderRadius: 999, padding: "10px 18px" }}
            />
            <button
              className="ag-btn"
              onClick={() => install(!!pendingInstall)}
              disabled={!packages.trim() || !!busy}
              style={{
                background: pendingInstall ? C.accent : C.navy,
                color: pendingInstall ? "#FFFFFF" : C.ink,
              }}
            >
              {busy === "install" ? <span className="ag-spinner" /> : <span>⤓</span>}
              <span>{pendingInstall ? "Confirm install" : "Install…"}</span>
            </button>
            {pendingInstall && (
              <span style={{ fontSize: 12, color: C.muted, fontFamily: FF_MONO }}>
                will run: {pendingInstall}
              </span>
            )}
          </div>
        )}

        <div style={{ display: "flex", gap: 10, padding: 16, alignItems: "center" }}>
          <input
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") run();
            }}
            placeholder="command to run inside the sandbox"
            disabled={!live}
            style={{ flex: 1, fontFamily: FF_MONO, fontSize: 12.5, borderRadius: 999, padding: "11px 18px" }}
          />
          <button
            className="ag-btn"
            onClick={run}
            disabled={!live || !!busy}
            style={{ background: live ? C.white : C.navyLight, color: live ? "#FFFFFF" : C.faint }}
          >
            {busy === "exec" ? <span className="ag-spinner" /> : <span>▶</span>}
            <span>Run</span>
          </button>
        </div>
      </Card>

      <StreamCard />

      <Card pad="22px 24px">
        <div style={{ fontSize: 15, fontWeight: 500, color: C.white, fontFamily: FF_HEAD, marginBottom: 10 }}>
          Same box, from an agent
        </div>
        <pre
          style={{
            margin: 0,
            background: C.navy,
            borderRadius: 16,
            padding: 14,
            fontSize: 12,
            lineHeight: 1.65,
            color: C.ink,
            fontFamily: FF_MONO,
            whiteSpace: "pre-wrap",
          }}
        >
{`const agencia = await AgenciaClient.connect();
const { text } = await agencia.call("compute_lease", { seconds: 60, cpu: 1, memMb: 512 });
const { leaseId } = JSON.parse(text);
await agencia.call("compute_exec", { leaseId, command: "python3 train.py" });
await agencia.call("compute_tick", { leaseId });   // every ${inventory?.tickSeconds ?? 10}s to stay alive
await agencia.call("compute_end",  { leaseId });`}
        </pre>
        {inventory?.directory && (
          <div style={{ marginTop: 14, fontSize: 12.5, color: C.muted, fontFamily: FF_MONO }}>
            {inventory.directory.filter((d) => d.status === "configured").length} live ·{" "}
            {inventory.directory.filter((d) => d.status !== "configured").length} listed providers in
            the routing directory
          </div>
        )}
      </Card>
    </section>
  );
}

function Spec({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "4px 0" }}>
      <span style={{ fontSize: 12, color: C.muted, fontFamily: FF_MONO }}>{label}</span>
      <span
        style={{
          fontSize: 12,
          color: C.ink,
          fontFamily: FF_MONO,
          textAlign: "right",
          wordBreak: "break-all",
        }}
      >
        {value}
      </span>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  disabled,
  step = 1,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  disabled?: boolean;
  step?: number;
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
        style={{ width: 86, borderRadius: 999, padding: "9px 14px" }}
      />
    </label>
  );
}
