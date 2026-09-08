import { Badge, Card, Empty, SectionTitle } from "../ui.js";
import { C, FF_MONO } from "../theme.js";
import { fmtHbar, shortId, timeAgo } from "../format.js";
import { useSessionCalls } from "../store.js";

export default function Session() {
  const [calls] = useSessionCalls();

  return (
    <section>
      <SectionTitle>Session activity</SectionTitle>
      <Card pad={0}>
        {calls.length ? (
          calls.map((c) => (
            <div
              key={c.id}
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 14,
                padding: "11px 18px",
                borderBottom: `1px solid ${C.border}`,
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 12.5,
                    color: C.ink,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {c.prompt}
                </div>
                <div style={{ fontSize: 10.5, color: C.faint, fontFamily: FF_MONO, marginTop: 3 }}>
                  {c.maxTokens} tok · {timeAgo(c.at)}
                  {c.txId ? ` · ${shortId(c.txId)}` : ""}
                </div>
              </div>
              <div style={{ flexShrink: 0 }}>
                {c.status === "running" && <Badge tone="neutral">running</Badge>}
                {c.status === "ok" && <Badge tone="pass">{c.hbar ? fmtHbar(c.hbar) : "paid"}</Badge>}
                {c.status === "error" && <Badge tone="breach">failed</Badge>}
              </div>
            </div>
          ))
        ) : (
          <div style={{ padding: 18 }}>
            <Empty text="No requests fired this session." />
          </div>
        )}
      </Card>
    </section>
  );
}
