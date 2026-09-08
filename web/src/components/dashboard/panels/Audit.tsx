import { Card, Empty, SectionTitle } from "../ui.js";
import { C, FF_HEAD, FF_MONO } from "../theme.js";
import { fmtHbar, shortId, timeAgo } from "../format.js";
import { useResource } from "../store.js";
import type { AuditResp } from "../types.js";

export default function Audit() {
  const { data: audit } = useResource<AuditResp>("audit");

  return (
    <section>
      <SectionTitle>HCS payment audit trail</SectionTitle>
      <Card pad={0}>
        {audit?.messages.length ? (
          <div>
            {audit.messages.map((m) => {
              const p = (m.payload ?? {}) as Record<string, unknown>;
              return (
                <div
                  key={m.sequence_number}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 14,
                    padding: "12px 18px",
                    borderBottom: `1px solid ${C.border}`,
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, color: C.ink, fontFamily: FF_MONO }}>
                      <span style={{ color: C.accent }}>#{m.sequence_number}</span>{" "}
                      {String(p.tool ?? p.type ?? "message")}
                    </div>
                    <div
                      style={{
                        fontSize: 10.5,
                        color: C.faint,
                        fontFamily: FF_MONO,
                        marginTop: 3,
                        wordBreak: "break-all",
                      }}
                    >
                      {p.payer ? `payer ${String(p.payer)} · ` : ""}
                      {p.transaction ? shortId(String(p.transaction)) : ""}
                    </div>
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    {p.amountTinybar != null && (
                      <div
                        style={{
                          fontSize: 12.5,
                          color: C.green,
                          fontFamily: FF_HEAD,
                          fontWeight: 700,
                        }}
                      >
                        {fmtHbar(Number(p.amountTinybar) / 1e8)}
                      </div>
                    )}
                    <div style={{ fontSize: 10, color: C.faint, fontFamily: FF_MONO }}>
                      {p.settledAt ? timeAgo(String(p.settledAt)) : ""}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div style={{ padding: 18 }}>
            <Empty
              text={
                audit?.topicId
                  ? "No messages on the audit topic yet — fire a paid request."
                  : (audit?.error ?? "No HCS topic configured on the service.")
              }
            />
          </div>
        )}
      </Card>
    </section>
  );
}
