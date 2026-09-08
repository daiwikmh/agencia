import { Badge, Card, Empty, KV, SectionTitle } from "../ui.js";
import { C, FF_HEAD, FF_MONO } from "../theme.js";
import { useResource } from "../store.js";
import type { ManifestResp } from "../types.js";

export default function Manifest() {
  const { data: manifestResp } = useResource<ManifestResp>("manifest");
  const manifest = manifestResp?.manifest ?? null;

  return (
    <section>
      <SectionTitle>Service manifest · /.well-known/x402</SectionTitle>
      <Card>
        {manifest ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: C.white, fontFamily: FF_HEAD }}>
                {manifest.service}
              </div>
              <div style={{ fontSize: 12.5, color: C.muted, marginTop: 3, lineHeight: 1.55 }}>
                {manifest.description}
              </div>
            </div>
            <div>
              <KV k="network" v={manifest.network} />
              <KV k="facilitator" v={manifest.facilitator} />
              <KV k="mcp" v={manifest.mcp.url} />
              {manifest.audit && (
                <KV
                  k="audit topic"
                  v={
                    <a
                      className="ag-link"
                      href={manifest.audit.mirror}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {manifest.audit.topicId} ↗
                    </a>
                  }
                />
              )}
            </div>
            <div>
              <SectionTitle style={{ marginBottom: 8 }}>Priced resources</SectionTitle>
              {manifest.resources.map((r) => (
                <div
                  key={r.resource}
                  style={{
                    border: `1px solid ${C.border}`,
                    borderRadius: 10,
                    padding: 12,
                    background: C.navy,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: 10,
                    }}
                  >
                    <span style={{ fontFamily: FF_MONO, fontSize: 13, color: C.ink }}>{r.tool}</span>
                    <Badge tone="accent">{r.asset}</Badge>
                  </div>
                  <div style={{ fontSize: 11, color: C.faint, fontFamily: FF_MONO, marginTop: 6 }}>
                    payTo {r.payTo} · memo "{r.memo}"
                  </div>
                  <div style={{ fontSize: 11, color: C.muted, fontFamily: FF_MONO, marginTop: 3 }}>
                    {r.pricing.model} — perCall {r.pricing.perCallHbar} ℏ · per1k{" "}
                    {r.pricing.per1kTokenHbar} ℏ
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <Empty
            text={manifestResp?.error ?? "Manifest unavailable — is the Agencia service running?"}
          />
        )}
      </Card>
    </section>
  );
}
