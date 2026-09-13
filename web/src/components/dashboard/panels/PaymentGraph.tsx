import { useEffect, useMemo, useRef } from "react";
import { C, FF_HEAD, FF_MONO } from "../theme.js";
import { fmtHbar, shortId } from "../format.js";
import { CATEGORY_COLOR, CATEGORY_COLOR_FALLBACK } from "../types.js";

export interface PaymentEvent {
  hbar: number;
  at: number;
  payer: string;
  tool: string;
}

interface Node {
  id: string;
  kind: "tool" | "payer";
  label: string;
  value: number;
  color: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  born: number;
  phase: number;
}

interface Link {
  a: string;
  b: string;
  weight: number;
}

const DAMPING = 0.9;
const SPRING = 0.0016;
const REPULSION = 2600;
const GRAVITY = 0.0016;
const DRIFT = 0.035;

/** One simulation tick. Never fully cools — the network keeps breathing. */
function step(nodes: Node[], links: Link[], w: number, h: number, t: number): void {
  const byId = new Map(nodes.map((n) => [n.id, n]));

  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i];
      const b = nodes[j];
      let dx = a.x - b.x;
      let dy = a.y - b.y;
      let d2 = dx * dx + dy * dy;
      if (d2 < 1) {
        dx = (i % 2 ? 1 : -1) * 0.6;
        dy = (j % 2 ? 1 : -1) * 0.6;
        d2 = 1;
      }
      const force = REPULSION / d2;
      const d = Math.sqrt(d2);
      const fx = (dx / d) * force;
      const fy = (dy / d) * force;
      a.vx += fx;
      a.vy += fy;
      b.vx -= fx;
      b.vy -= fy;
    }
  }

  for (const link of links) {
    const a = byId.get(link.a);
    const b = byId.get(link.b);
    if (!a || !b) continue;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const pull = SPRING * (0.5 + link.weight);
    a.vx += dx * pull;
    a.vy += dy * pull;
    b.vx -= dx * pull;
    b.vy -= dy * pull;
  }

  const cx = w / 2;
  const cy = h / 2;
  for (const n of nodes) {
    n.vx += (cx - n.x) * GRAVITY;
    n.vy += (cy - n.y) * GRAVITY;

    // a slow wander so the graph never freezes into a still image
    n.vx += Math.cos(t * 0.0004 + n.phase) * DRIFT;
    n.vy += Math.sin(t * 0.0005 + n.phase * 1.7) * DRIFT;

    n.vx *= DAMPING;
    n.vy *= DAMPING;
    n.x += n.vx;
    n.y += n.vy;

    const margin = 22;
    if (n.x < margin) {
      n.x = margin;
      n.vx = Math.abs(n.vx) * 0.4;
    }
    if (n.x > w - margin) {
      n.x = w - margin;
      n.vx = -Math.abs(n.vx) * 0.4;
    }
    if (n.y < margin) {
      n.y = margin;
      n.vy = Math.abs(n.vy) * 0.4;
    }
    if (n.y > h - margin) {
      n.y = h - margin;
      n.vy = -Math.abs(n.vy) * 0.4;
    }
  }
}

export default function PaymentGraph({
  events,
  toolCategory,
  height = 320,
  showLegend = true,
}: {
  events: PaymentEvent[];
  toolCategory: Map<string, string>;
  height?: number;
  showLegend?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const nodesRef = useRef<Node[]>([]);
  const linksRef = useRef<Link[]>([]);

  const model = useMemo(() => {
    const toolTotals = new Map<string, number>();
    const payerTotals = new Map<string, number>();
    const edgeTotals = new Map<string, number>();

    for (const e of events) {
      toolTotals.set(e.tool, (toolTotals.get(e.tool) ?? 0) + e.hbar);
      payerTotals.set(e.payer, (payerTotals.get(e.payer) ?? 0) + e.hbar);
      const key = `${e.payer}|${e.tool}`;
      edgeTotals.set(key, (edgeTotals.get(key) ?? 0) + e.hbar);
    }
    const maxEdge = Math.max(...edgeTotals.values(), Number.EPSILON);

    return {
      toolTotals,
      payerTotals,
      links: [...edgeTotals.entries()].map(([key, hbar]) => {
        const [payer, tool] = key.split("|");
        return { a: `payer:${payer}`, b: `tool:${tool}`, weight: hbar / maxEdge };
      }),
      totalHbar: [...toolTotals.values()].reduce((s, v) => s + v, 0),
    };
  }, [events, toolCategory]);

  // Merge new data into the running simulation instead of rebuilding it, so
  // positions survive and fresh payments simply arrive.
  useEffect(() => {
    const existing = new Map(nodesRef.current.map((n) => [n.id, n]));
    const next: Node[] = [];
    const now = performance.now();
    const width = canvasRef.current?.clientWidth ?? 400;

    const upsert = (id: string, kind: Node["kind"], label: string, value: number, color: string) => {
      const prior = existing.get(id);
      if (prior) {
        prior.value = value;
        prior.label = label;
        prior.color = color;
        next.push(prior);
        return;
      }
      const angle = Math.random() * Math.PI * 2;
      next.push({
        id,
        kind,
        label,
        value,
        color,
        x: width / 2 + Math.cos(angle) * (width / 3),
        y: height / 2 + Math.sin(angle) * (height / 3),
        vx: 0,
        vy: 0,
        born: now,
        phase: Math.random() * Math.PI * 2,
      });
    };

    for (const [tool, value] of model.toolTotals) {
      upsert(
        `tool:${tool}`,
        "tool",
        tool,
        value,
        CATEGORY_COLOR[toolCategory.get(tool) ?? ""] ?? CATEGORY_COLOR_FALLBACK,
      );
    }
    for (const [payer, value] of model.payerTotals) {
      upsert(`payer:${payer}`, "payer", shortId(payer), value, "#FFFFFF");
    }

    nodesRef.current = next;
    linksRef.current = model.links;
  }, [model, toolCategory, height]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let frame = 0;
    let running = true;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.clientWidth;
      canvas.width = w * dpr;
      canvas.height = height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    const onVisibility = () => {
      running = document.visibilityState === "visible";
      if (running) frame = requestAnimationFrame(draw);
    };
    document.addEventListener("visibilitychange", onVisibility);

    const draw = (t: number) => {
      if (!running) return;
      const w = canvas.clientWidth;
      const nodes = nodesRef.current;
      const links = linksRef.current;

      step(nodes, links, w, height, t);

      ctx.clearRect(0, 0, w, height);
      ctx.fillStyle = "#101724";
      ctx.fillRect(0, 0, w, height);

      const maxValue = Math.max(...nodes.map((n) => n.value), Number.EPSILON);
      const radius = (n: Node) => {
        const base = 3.5 + Math.sqrt(n.value / maxValue) * 13;
        const age = Math.min(1, (t - n.born) / 900);
        return base * (0.2 + age * 0.8);
      };
      const byId = new Map(nodes.map((n) => [n.id, n]));

      for (const link of links) {
        const a = byId.get(link.a);
        const b = byId.get(link.b);
        if (!a || !b) continue;
        const pulse = 0.5 + 0.5 * Math.sin(t * 0.0015 + link.weight * 6);
        ctx.strokeStyle = `rgba(125,162,212,${0.16 + link.weight * 0.5 * pulse})`;
        ctx.lineWidth = 0.5 + link.weight * 2.6;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }

      for (const n of nodes) {
        const r = radius(n);
        const glow = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, r * 3.4);
        glow.addColorStop(0, `${n.color}55`);
        glow.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(n.x, n.y, r * 3.4, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = n.kind === "payer" ? "#101724" : n.color;
        ctx.strokeStyle = n.kind === "payer" ? "#FFFFFF" : "rgba(255,255,255,0.35)";
        ctx.lineWidth = n.kind === "payer" ? 2 : 1;
        ctx.beginPath();
        ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        if (r > 9) {
          ctx.fillStyle = "rgba(255,255,255,0.72)";
          ctx.font = `10px ${FF_MONO.split(",")[0].replace(/'/g, "")}, monospace`;
          ctx.textAlign = "center";
          ctx.fillText(n.label, n.x, n.y + r + 12);
        }
      }

      frame = requestAnimationFrame(draw);
    };

    frame = requestAnimationFrame(draw);
    return () => {
      running = false;
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [height]);

  const empty = model.toolTotals.size === 0;

  return (
    <div>
      <div style={{ position: "relative", borderRadius: 18, overflow: "hidden", background: "#101724" }}>
        <canvas
          ref={canvasRef}
          style={{ width: "100%", height, display: "block" }}
          aria-label="Live payment network"
        />
        {empty && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "rgba(255,255,255,0.45)",
              fontSize: 12.5,
              fontFamily: FF_MONO,
              textAlign: "center",
              padding: 20,
            }}
          >
            No settled payments on the audit topic yet.
          </div>
        )}
      </div>

      {showLegend && (
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: 14,
            marginTop: 12,
            fontSize: 11.5,
            color: C.muted,
            fontFamily: FF_MONO,
          }}
        >
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <span
              style={{
                width: 9,
                height: 9,
                borderRadius: "50%",
                background: C.white,
                border: `2px solid ${C.white}`,
              }}
            />
            {model.payerTotals.size} agent{model.payerTotals.size === 1 ? "" : "s"}
          </span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 9, height: 9, borderRadius: "50%", background: C.cyan }} />
            {model.toolTotals.size} tool{model.toolTotals.size === 1 ? "" : "s"}
          </span>
          <span>{model.links.length} routes</span>
          <span style={{ marginLeft: "auto", fontFamily: FF_HEAD, color: C.ink }}>
            {fmtHbar(model.totalHbar)} settled
          </span>
        </div>
      )}
    </div>
  );
}
